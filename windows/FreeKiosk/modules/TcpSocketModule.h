#pragma once

#include "NativeModules.h"
#include <string>
#include <map>
#include <mutex>
#include <thread>
#include <atomic>

#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(TcpSocketModule)
struct TcpSocketModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  // Server methods
  REACT_METHOD(createServer)
  void createServer(int port, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(closeServer)
  void closeServer(int serverId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Client methods
  REACT_METHOD(connect)
  void connect(std::string host, int port, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(send)
  void send(int socketId, std::string data, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(close)
  void close(int socketId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Event emitters (set by RN framework)
  REACT_EVENT(onTcpData)
  std::function<void(int socketId, std::string data)> onTcpData{nullptr};

  REACT_EVENT(onTcpConnection)
  std::function<void(int socketId, std::string remoteAddress, int remotePort)> onTcpConnection{nullptr};

  REACT_EVENT(onTcpError)
  std::function<void(int socketId, std::string error)> onTcpError{nullptr};

  REACT_EVENT(onTcpClose)
  std::function<void(int socketId)> onTcpClose{nullptr};

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;

private:
  struct SocketInfo {
    SOCKET socket{INVALID_SOCKET};
    int socketId{0};
    std::string remoteAddress;
    int remotePort{0};
  };

  void InitializeWinsock() noexcept;
  void Cleanup() noexcept;
  void HandleServerAccept(SOCKET listenSocket, int serverId) noexcept;
  void HandleClientConnection(SOCKET clientSocket, sockaddr_in clientAddr) noexcept;
  void ReadSocketData(int socketId) noexcept;

  bool m_wsaInitialized{false};
  WSADATA m_wsaData{};
  std::map<int, SocketInfo> m_sockets;
  std::map<int, SOCKET> m_servers;
  std::mutex m_mutex;
  int m_nextSocketId{1};
  int m_nextServerId{1};
};

} // namespace winrt::FreeKiosk::implementation
