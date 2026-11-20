#include "pch.h"
#include "ScreenshotModule.h"

#include <winrt/Microsoft.ReactNative.h>

#include <windows.h>
#include <gdiplus.h>

#pragma comment(lib, "gdiplus.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Gdiplus;

void ScreenshotModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void ScreenshotModule::captureScreen(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void ScreenshotModule::captureScreenToFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void ScreenshotModule::captureRegion(int x, int y, int width, int height, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
