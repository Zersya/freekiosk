#pragma once

#include "NativeModules.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(HttpServerModule)
struct HttpServerModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(startServer)
  void startServer(int port, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(stopServer)
  void stopServer(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(isRunning)
  void isRunning(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(getServerInfo)
  void getServerInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getLocalIp)
  void getLocalIp(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(updateStatus)
  void updateStatus(winrt::Windows::Foundation::IInspectable status, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendCommand)
  void sendCommand(std::string path, winrt::Windows::Foundation::IInspectable params, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
