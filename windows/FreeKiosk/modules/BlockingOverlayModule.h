#pragma once

#include "NativeModules.h"
#include "JSValue.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(BlockingOverlayModule)
struct BlockingOverlayModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(showOverlay)
  void showOverlay(int id, int x, int y, int width, int height, std::string color, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(hideOverlay)
  void hideOverlay(int id, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(clearOverlays)
  void clearOverlays(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getOverlays)
  void getOverlays(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
