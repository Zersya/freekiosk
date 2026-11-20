#pragma once

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Microsoft.ReactNative.Cxx.h>
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(ScreenshotModule)
struct ScreenshotModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(captureScreen)
  void captureScreen(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(captureScreenToFile)
  void captureScreenToFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(captureRegion)
  void captureRegion(int x, int y, int width, int height, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
