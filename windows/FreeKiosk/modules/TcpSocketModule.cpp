#include "pch.h"
#include "TcpSocketModule.h"
#include "Base64.h"
#include "ScreenCapture.h"

#include <chrono>
#include <fstream>
#include <filesystem>

namespace {
// TEMP diagnostic: trace socket event flow to LocalState.
void TcpTrace(std::string const &msg) {
  try {
    std::ofstream f(std::filesystem::path(
        winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path().c_str()) / "freekiosk_tcp.log",
        std::ios::app);
    f << msg << std::endl;
  } catch (...) {
  }
}
}

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void TcpSocketModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
  InitializeWinsock();
}

void TcpSocketModule::InitializeWinsock() noexcept {
  if (!m_wsaInitialized) {
    int result = WSAStartup(MAKEWORD(2, 2), &m_wsaData);
    if (result == 0) {
      m_wsaInitialized = true;
    }
  }
}

void TcpSocketModule::Cleanup() noexcept {
  std::map<int, std::shared_ptr<SocketState>> sockets;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    sockets.swap(m_sockets);
    for (auto &[id, socket] : m_servers) {
      if (socket != INVALID_SOCKET) {
        closesocket(socket);
      }
    }
    m_servers.clear();
  }

  for (auto &[id, state] : sockets) {
    std::lock_guard<std::mutex> writeLock(state->writeMutex);
    state->closed = true;
    if (state->socket != INVALID_SOCKET) {
      closesocket(state->socket);
      state->socket = INVALID_SOCKET;
    }
  }

  if (m_wsaInitialized) {
    WSACleanup();
    m_wsaInitialized = false;
  }
}

void TcpSocketModule::Emit(std::wstring_view name, JSValueObject &&payload) noexcept {
  TcpTrace("emit " + std::string(name.begin(), name.end()));
  // EmitJSEvent marshals to the JS thread internally — same pattern as
  // RNW's Microsoft::React::Modules::SendEvent; no explicit dispatcher post.
  m_reactContext.EmitJSEvent(L"RCTDeviceEventEmitter", std::move(name), std::move(payload));
}

void TcpSocketModule::EmitSocketError(int socketId, std::string const &message) noexcept {
  JSValueObject payload;
  payload["socketId"] = socketId;
  payload["error"] = message;
  Emit(L"tcpError", std::move(payload));
}

void TcpSocketModule::createServer(int port, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept {
  if (!m_wsaInitialized) {
    promise.Reject("Winsock not initialized");
    return;
  }

  SOCKET listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listenSocket == INVALID_SOCKET) {
    promise.Reject("Failed to create socket");
    return;
  }

  int opt = 1;
  setsockopt(listenSocket, SOL_SOCKET, SO_REUSEADDR, (char *)&opt, sizeof(opt));

  sockaddr_in serverAddr = {};
  serverAddr.sin_family = AF_INET;
  serverAddr.sin_addr.s_addr = INADDR_ANY;
  serverAddr.sin_port = htons(port);

  if (bind(listenSocket, (sockaddr *)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
    closesocket(listenSocket);
    promise.Reject(("Failed to bind to port " + std::to_string(port)).c_str());
    return;
  }

  if (listen(listenSocket, SOMAXCONN) == SOCKET_ERROR) {
    closesocket(listenSocket);
    promise.Reject(("Failed to listen on port " + std::to_string(port)).c_str());
    return;
  }

  u_long mode = 1;
  ioctlsocket(listenSocket, FIONBIO, &mode);

  int serverId;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    serverId = m_nextServerId++;
    m_servers[serverId] = listenSocket;
  }

  std::thread([this, listenSocket, serverId]() {
    this->HandleServerAccept(listenSocket, serverId);
  }).detach();

  promise.Resolve(serverId);
}

void TcpSocketModule::closeServer(int serverId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(m_mutex);

  auto it = m_servers.find(serverId);
  if (it == m_servers.end()) {
    promise.Resolve();
    return;
  }

  if (it->second != INVALID_SOCKET) {
    closesocket(it->second);
  }
  m_servers.erase(it);
  promise.Resolve();
}

void TcpSocketModule::connect(std::string host, int port, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept {
  if (!m_wsaInitialized) {
    promise.Reject("Winsock not initialized");
    return;
  }

  SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (sock == INVALID_SOCKET) {
    promise.Reject("Failed to create socket");
    return;
  }

  addrinfo hints = {};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;

  addrinfo *result = nullptr;
  std::string portStr = std::to_string(port);
  int addrResult = getaddrinfo(host.c_str(), portStr.c_str(), &hints, &result);
  if (addrResult != 0) {
    closesocket(sock);
    promise.Reject(("Failed to resolve host: " + host).c_str());
    return;
  }

  int connectResult = ::connect(sock, result->ai_addr, (int)result->ai_addrlen);
  freeaddrinfo(result);

  if (connectResult == SOCKET_ERROR) {
    closesocket(sock);
    promise.Reject(("Failed to connect to " + host + ":" + portStr).c_str());
    return;
  }

  sockaddr_in remoteAddr = {};
  int addrLen = sizeof(remoteAddr);
  getpeername(sock, (sockaddr *)&remoteAddr, &addrLen);

  char ipStr[INET_ADDRSTRLEN];
  inet_ntop(AF_INET, &remoteAddr.sin_addr, ipStr, INET_ADDRSTRLEN);

  int socketId;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    socketId = m_nextSocketId++;
    auto state = std::make_shared<SocketState>();
    state->socket = sock;
    state->socketId = socketId;
    state->serverId = 0;
    state->remoteAddress = ipStr;
    state->remotePort = ntohs(remoteAddr.sin_port);
    m_sockets[socketId] = state;
  }

  u_long mode = 1;
  ioctlsocket(sock, FIONBIO, &mode);

  std::thread([this, socketId]() {
    this->ReadSocketData(socketId);
  }).detach();

  promise.Resolve(socketId);
}

void TcpSocketModule::send(int socketId, std::string base64, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::shared_ptr<SocketState> state;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sockets.find(socketId);
    if (it == m_sockets.end()) {
      promise.Reject(("Socket not found: " + std::to_string(socketId)).c_str());
      return;
    }
    state = it->second;
  }

  std::vector<uint8_t> bytes;
  if (!::FreeKiosk::Base64::Decode(base64, bytes)) {
    promise.Reject("Invalid base64 payload");
    return;
  }

  if (!bytes.empty() && !SendAll(*state, bytes.data(), bytes.size())) {
    TcpTrace("send FAIL socketId=" + std::to_string(socketId));
    promise.Reject("Failed to send data");
    return;
  }
  TcpTrace("send ok socketId=" + std::to_string(socketId));

  promise.Resolve();
}

void TcpSocketModule::close(int socketId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  CloseSocketInternal(socketId, false);
  promise.Resolve();
}

void TcpSocketModule::startMjpegStream(int socketId, int intervalMs, int quality, int maxDimension,
                                       winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::shared_ptr<SocketState> state;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sockets.find(socketId);
    if (it == m_sockets.end()) {
      promise.Reject(("Socket not found: " + std::to_string(socketId)).c_str());
      return;
    }
    state = it->second;
  }

  int previous = m_mjpegSocketId.exchange(socketId);
  if (previous != -1 && previous != socketId) {
    // A new client steals the stream (Android behaviour).
    CloseSocketInternal(previous, true);
  }

  promise.Resolve();

  std::thread([this, socketId, intervalMsParam = intervalMs, quality, maxDimension, state]() {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    int intervalMs = intervalMsParam <= 0 ? 250 : intervalMsParam;

    while (m_mjpegSocketId.load() == socketId && !state->closed.load()) {
      auto tickStart = std::chrono::steady_clock::now();

      ::FreeKiosk::Capture::Frame frame;
      std::string error;
      if (::FreeKiosk::Capture::CapturePrimary(::FreeKiosk::Capture::ImageFormat::Jpeg, quality, maxDimension, frame,
                                             error)) {
        std::string header = "--freekiosk-frame\r\nContent-Type: image/jpeg\r\nContent-Length: " +
            std::to_string(frame.bytes.size()) + "\r\n\r\n";
        if (!SendAll(*state, reinterpret_cast<uint8_t const *>(header.data()), header.size()) ||
            !SendAll(*state, frame.bytes.data(), frame.bytes.size())) {
          break;
        }
      }
      // A capture failure skips that frame and continues.

      auto elapsed = std::chrono::steady_clock::now() - tickStart;
      auto remaining = std::chrono::milliseconds(intervalMs) - elapsed;
      if (remaining > std::chrono::milliseconds(0)) {
        std::this_thread::sleep_for(remaining);
      }
    }

    if (m_mjpegSocketId.load() == socketId) {
      m_mjpegSocketId = -1;
    }
    CloseSocketInternal(socketId, true);
  }).detach();
}

void TcpSocketModule::stopMjpegStream(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  int active = m_mjpegSocketId.exchange(-1);
  if (active != -1) {
    CloseSocketInternal(active, true);
  }
  promise.Resolve();
}

void TcpSocketModule::HandleServerAccept(SOCKET listenSocket, int serverId) noexcept {
  while (true) {
    sockaddr_in clientAddr = {};
    int clientAddrLen = sizeof(clientAddr);
    SOCKET clientSocket = accept(listenSocket, (sockaddr *)&clientAddr, &clientAddrLen);

    if (clientSocket == INVALID_SOCKET) {
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_servers.find(serverId) == m_servers.end()) {
          break;
        }
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
      continue;
    }

    HandleClientConnection(clientSocket, clientAddr, serverId);
  }
}

void TcpSocketModule::HandleClientConnection(SOCKET clientSocket, sockaddr_in clientAddr, int serverId) noexcept {
  char ipStr[INET_ADDRSTRLEN];
  inet_ntop(AF_INET, &clientAddr.sin_addr, ipStr, INET_ADDRSTRLEN);
  int remotePort = ntohs(clientAddr.sin_port);

  int socketId;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    socketId = m_nextSocketId++;
    auto state = std::make_shared<SocketState>();
    state->socket = clientSocket;
    state->socketId = socketId;
    state->serverId = serverId;
    state->remoteAddress = ipStr;
    state->remotePort = remotePort;
    m_sockets[socketId] = state;
  }

  u_long mode = 1;
  ioctlsocket(clientSocket, FIONBIO, &mode);

  JSValueObject payload;
  payload["serverId"] = serverId;
  payload["socketId"] = socketId;
  payload["remoteAddress"] = std::string(ipStr);
  payload["remotePort"] = remotePort;
  Emit(L"tcpConnection", std::move(payload));
  TcpTrace("conn socketId=" + std::to_string(socketId));
  std::thread([this, socketId]() {
    this->ReadSocketData(socketId);
  }).detach();
}

void TcpSocketModule::ReadSocketData(int socketId) noexcept {
  std::shared_ptr<SocketState> state;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sockets.find(socketId);
    if (it == m_sockets.end()) {
      return;
    }
    state = it->second;
  }

  char buffer[8192];
  while (true) {
    int bytesRead = recv(state->socket, buffer, sizeof(buffer), 0);

    if (bytesRead > 0) {
      TcpTrace("data socketId=" + std::to_string(socketId) + " bytes=" + std::to_string(bytesRead));
      std::string data = ::FreeKiosk::Base64::Encode(reinterpret_cast<uint8_t const *>(buffer), bytesRead);
      JSValueObject payload;
      payload["socketId"] = socketId;
      payload["data"] = data;
      Emit(L"tcpData", std::move(payload));
    } else if (bytesRead == 0) {
      CloseSocketInternal(socketId, true);
      break;
    } else {
      int error = WSAGetLastError();
      if (error == WSAEWOULDBLOCK) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        continue;
      } else if (error == WSAECONNRESET || error == WSAECONNABORTED) {
        CloseSocketInternal(socketId, true);
        break;
      } else {
        EmitSocketError(socketId, "Socket error: " + std::to_string(error));
        CloseSocketInternal(socketId, true);
        break;
      }
    }
  }
}

void TcpSocketModule::CloseSocketInternal(int socketId, bool emitClose) noexcept {
  std::shared_ptr<SocketState> state;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sockets.find(socketId);
    if (it == m_sockets.end()) {
      return;
    }
    state = it->second;
    m_sockets.erase(it);
  }

  {
    std::lock_guard<std::mutex> writeLock(state->writeMutex);
    state->closed = true;
    if (state->socket != INVALID_SOCKET) {
      closesocket(state->socket);
      state->socket = INVALID_SOCKET;
    }
  }

  if (emitClose) {
    JSValueObject payload;
    payload["socketId"] = socketId;
    Emit(L"tcpClose", std::move(payload));
  }
}

bool TcpSocketModule::SendAll(SocketState &s, uint8_t const *data, size_t len) noexcept {
  std::lock_guard<std::mutex> writeLock(s.writeMutex);
  if (s.closed.load()) {
    return false;
  }

  size_t sent = 0;
  while (sent < len) {
    int result = ::send(s.socket, reinterpret_cast<const char *>(data + sent), static_cast<int>(len - sent), 0);
    if (result == SOCKET_ERROR) {
      int error = WSAGetLastError();
      if (error == WSAEWOULDBLOCK) {
        fd_set writeSet;
        FD_ZERO(&writeSet);
        FD_SET(s.socket, &writeSet);
        timeval timeout;
        timeout.tv_sec = 5;
        timeout.tv_usec = 0;
        int sel = select(0, nullptr, &writeSet, nullptr, &timeout);
        if (sel <= 0) {
          return false;
        }
        continue;
      }
      return false;
    }
    sent += result;
  }
  return true;
}

} // namespace winrt::FreeKiosk::implementation
