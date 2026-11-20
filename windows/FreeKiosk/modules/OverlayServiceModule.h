#pragma once

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Microsoft.ReactNative.Cxx.h>
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(OverlayServiceModule)
struct OverlayServiceModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(start)
  void start(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(stop)
  void stop(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(isRunning)
  void isRunning(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(showOverlay)
  void showOverlay(std::string packageName, int x, int y, int width, int height, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(hideOverlay)
  void hideOverlay(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
