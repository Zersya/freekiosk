#include "pch.h"
#include "HttpServerModule.h"

#include "NativeModules.h"
#include "JSValue.h"

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

void HttpServerModule::getServerInfo(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["port"] = JSValue(8080);
  map["running"] = JSValue(false);
  promise.Resolve(map);
}

void HttpServerModule::getLocalIp(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("127.0.0.1");
}

void HttpServerModule::updateStatus(winrt::Windows::Foundation::IInspectable status, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::sendCommand(std::string path, winrt::Windows::Foundation::IInspectable params, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
