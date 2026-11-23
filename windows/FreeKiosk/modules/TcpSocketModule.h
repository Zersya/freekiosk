#pragma once

#include "NativeModules.h"
#include <string>
#include <string_view>
#include <memory>
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
  void send(int socketId, std::string base64, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(close)
  void close(int socketId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // MJPEG streaming
  REACT_METHOD(startMjpegStream)
  void startMjpegStream(int socketId, int intervalMs, int quality, int maxDimension, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(stopMjpegStream)
  void stopMjpegStream(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;

private:
  struct SocketState {
    SOCKET socket{INVALID_SOCKET};
    int socketId{0};
    int serverId{0};
    std::string remoteAddress;
    int remotePort{0};
    std::mutex writeMutex;
    std::atomic<bool> closed{false};
  };

  void InitializeWinsock() noexcept;
  void Cleanup() noexcept;
  void HandleServerAccept(SOCKET listenSocket, int serverId) noexcept;
  void HandleClientConnection(SOCKET clientSocket, sockaddr_in clientAddr, int serverId) noexcept;
  void ReadSocketData(int socketId) noexcept;
  void CloseSocketInternal(int socketId, bool emitClose) noexcept;
  bool SendAll(SocketState &s, uint8_t const *data, size_t len) noexcept;
  void Emit(std::wstring_view name, winrt::Microsoft::ReactNative::JSValueObject &&payload) noexcept;
  void EmitSocketError(int socketId, std::string const &message) noexcept;

  bool m_wsaInitialized{false};
  WSADATA m_wsaData{};
  std::map<int, std::shared_ptr<SocketState>> m_sockets;
  std::map<int, SOCKET> m_servers;
  std::mutex m_mutex;
  int m_nextSocketId{1};
  int m_nextServerId{1};
  std::atomic<int> m_mjpegSocketId{-1};
};

} // namespace winrt::FreeKiosk::implementation
