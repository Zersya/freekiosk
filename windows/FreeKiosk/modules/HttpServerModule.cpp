#include "pch.h"
#include "HttpServerModule.h"

#include "NativeModules.h"

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void HttpServerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void HttpServerModule::startServer(int port, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::stopServer(ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::isRunning(ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void HttpServerModule::getServerInfo(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("{\"port\":\"8080\",\"running\":\"false\"}");
}

void HttpServerModule::getLocalIp(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("127.0.0.1");
}

void HttpServerModule::updateStatus(std::string status, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::sendCommand(std::string path, std::string params, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
