#pragma once

#include "NativeModules.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(ScreenshotModule)
struct ScreenshotModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(capture)
  void capture(std::string format, int quality, int maxDimension, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getScreenInfo)
  void getScreenInfo(int maxDimension, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
