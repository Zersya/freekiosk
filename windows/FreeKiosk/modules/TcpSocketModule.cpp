#include "pch.h"
#include "TcpSocketModule.h"


namespace winrt::FreeKiosk::implementation {

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
  std::lock_guard<std::mutex> lock(m_mutex);

  for (auto& [id, info] : m_sockets) {
    if (info.socket != INVALID_SOCKET) {
      closesocket(info.socket);
    }
  }
  m_sockets.clear();

  for (auto& [id, socket] : m_servers) {
    if (socket != INVALID_SOCKET) {
      closesocket(socket);
    }
  }
  m_servers.clear();

  if (m_wsaInitialized) {
    WSACleanup();
    m_wsaInitialized = false;
  }
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
  setsockopt(listenSocket, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

  sockaddr_in serverAddr = {};
  serverAddr.sin_family = AF_INET;
  serverAddr.sin_addr.s_addr = INADDR_ANY;
  serverAddr.sin_port = htons(port);

  if (bind(listenSocket, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
    closesocket(listenSocket);
    promise.Reject("Failed to bind to port " + std::to_string(port));
    return;
  }

  if (listen(listenSocket, SOMAXCONN) == SOCKET_ERROR) {
    closesocket(listenSocket);
    promise.Reject("Failed to listen on port " + std::to_string(port));
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

  addrinfo* result = nullptr;
  std::string portStr = std::to_string(port);
  int addrResult = getaddrinfo(host.c_str(), portStr.c_str(), &hints, &result);
  if (addrResult != 0) {
    closesocket(sock);
    promise.Reject("Failed to resolve host: " + host);
    return;
  }

  int connectResult = ::connect(sock, result->ai_addr, (int)result->ai_addrlen);
  freeaddrinfo(result);

  if (connectResult == SOCKET_ERROR) {
    closesocket(sock);
    promise.Reject("Failed to connect to " + host + ":" + portStr);
    return;
  }

  sockaddr_in remoteAddr = {};
  int addrLen = sizeof(remoteAddr);
  getpeername(sock, (sockaddr*)&remoteAddr, &addrLen);

  char ipStr[INET_ADDRSTRLEN];
  inet_ntop(AF_INET, &remoteAddr.sin_addr, ipStr, INET_ADDRSTRLEN);

  int socketId;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    socketId = m_nextSocketId++;
    SocketInfo info;
    info.socket = sock;
    info.socketId = socketId;
    info.remoteAddress = ipStr;
    info.remotePort = ntohs(remoteAddr.sin_port);
    m_sockets[socketId] = info;
  }

  u_long mode = 1;
  ioctlsocket(sock, FIONBIO, &mode);

  std::thread([this, socketId]() {
    this->ReadSocketData(socketId);
  }).detach();

  promise.Resolve(socketId);
}

void TcpSocketModule::send(int socketId, std::string data, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(m_mutex);

  auto it = m_sockets.find(socketId);
  if (it == m_sockets.end()) {
    promise.Reject("Socket not found: " + std::to_string(socketId));
    return;
  }

  SOCKET sock = it->second.socket;
  int sent = ::send(sock, data.c_str(), (int)data.length(), 0);
  if (sent == SOCKET_ERROR) {
    promise.Reject("Failed to send data");
    return;
  }

  promise.Resolve();
}

void TcpSocketModule::close(int socketId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(m_mutex);

  auto it = m_sockets.find(socketId);
  if (it == m_sockets.end()) {
    promise.Resolve();
    return;
  }

  if (it->second.socket != INVALID_SOCKET) {
    closesocket(it->second.socket);
  }
  m_sockets.erase(it);
  promise.Resolve();
}

void TcpSocketModule::HandleServerAccept(SOCKET listenSocket, int serverId) noexcept {
  while (true) {
    sockaddr_in clientAddr = {};
    int clientAddrLen = sizeof(clientAddr);
    SOCKET clientSocket = accept(listenSocket, (sockaddr*)&clientAddr, &clientAddrLen);

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

    HandleClientConnection(clientSocket, clientAddr);
  }
}

void TcpSocketModule::HandleClientConnection(SOCKET clientSocket, sockaddr_in clientAddr) noexcept {
  char ipStr[INET_ADDRSTRLEN];
  inet_ntop(AF_INET, &clientAddr.sin_addr, ipStr, INET_ADDRSTRLEN);
  int remotePort = ntohs(clientAddr.sin_port);

  int socketId;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    socketId = m_nextSocketId++;
    SocketInfo info;
    info.socket = clientSocket;
    info.socketId = socketId;
    info.remoteAddress = ipStr;
    info.remotePort = remotePort;
    m_sockets[socketId] = info;
  }

  u_long mode = 1;
  ioctlsocket(clientSocket, FIONBIO, &mode);

  if (onTcpConnection) {
    m_reactContext.UIDispatcher().Post([this, socketId, ipStr = std::string(ipStr), remotePort]() {
      if (onTcpConnection) {
        onTcpConnection(socketId, ipStr, remotePort);
      }
    });
  }

  std::thread([this, socketId]() {
    this->ReadSocketData(socketId);
  }).detach();
}

void TcpSocketModule::ReadSocketData(int socketId) noexcept {
  SOCKET sock;
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sockets.find(socketId);
    if (it == m_sockets.end()) {
      return;
    }
    sock = it->second.socket;
  }

  char buffer[4096];
  while (true) {
    int bytesRead = recv(sock, buffer, sizeof(buffer) - 1, 0);

    if (bytesRead > 0) {
      buffer[bytesRead] = '\0';
      std::string data(buffer, bytesRead);

      if (onTcpData) {
        m_reactContext.UIDispatcher().Post([this, socketId, data]() {
          if (onTcpData) {
            onTcpData(socketId, data);
          }
        });
      }
    } else if (bytesRead == 0) {
      if (onTcpClose) {
        m_reactContext.UIDispatcher().Post([this, socketId]() {
          if (onTcpClose) {
            onTcpClose(socketId);
          }
        });
      }
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_sockets.find(socketId);
        if (it != m_sockets.end()) {
          closesocket(it->second.socket);
          m_sockets.erase(it);
        }
      }
      break;
    } else {
      int error = WSAGetLastError();
      if (error == WSAEWOULDBLOCK) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        continue;
      } else if (error == WSAECONNRESET || error == WSAECONNABORTED) {
        if (onTcpClose) {
          m_reactContext.UIDispatcher().Post([this, socketId]() {
            if (onTcpClose) {
              onTcpClose(socketId);
            }
          });
        }
        {
          std::lock_guard<std::mutex> lock(m_mutex);
          auto it = m_sockets.find(socketId);
          if (it != m_sockets.end()) {
            closesocket(it->second.socket);
            m_sockets.erase(it);
          }
        }
        break;
      } else {
        std::string errorMsg = "Socket error: " + std::to_string(error);
        if (onTcpError) {
          m_reactContext.UIDispatcher().Post([this, socketId, errorMsg]() {
            if (onTcpError) {
              onTcpError(socketId, errorMsg);
            }
          });
        }
        break;
      }
    }
  }
}

} // namespace winrt::FreeKiosk::implementation
