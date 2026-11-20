#include "pch.h"
#include "HttpServerModule.h"

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Windows.Foundation.Collections.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

void HttpServerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void HttpServerModule::startServer(int port, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::stopServer(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::isRunning(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void HttpServerModule::getServerInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"port", winrt::box_value(8080));
  map.Insert(L"running", winrt::box_value(false));
  promise.Resolve(map);
}

void HttpServerModule::getLocalIp(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("127.0.0.1");
}

void HttpServerModule::updateStatus(IInspectable status, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void HttpServerModule::sendCommand(std::string path, IInspectable params, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
