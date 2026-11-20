#include "pch.h"
#include "OverlayServiceModule.h"

namespace winrt::FreeKiosk::implementation {

void OverlayServiceModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void OverlayServiceModule::start(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void OverlayServiceModule::stop(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void OverlayServiceModule::isRunning(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void OverlayServiceModule::showOverlay(std::string packageName, int x, int y, int width, int height, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void OverlayServiceModule::hideOverlay(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
