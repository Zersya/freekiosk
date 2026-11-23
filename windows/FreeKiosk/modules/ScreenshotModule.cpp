#include "pch.h"
#include "ScreenshotModule.h"

#include "Base64.h"
#include "ScreenCapture.h"

#include <thread>

namespace winrt::FreeKiosk::implementation {

void ScreenshotModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void ScreenshotModule::capture(std::string format, int quality, int maxDimension,
                               winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  ::FreeKiosk::Capture::ImageFormat fmt;
  if (format == "jpeg") {
    fmt = ::FreeKiosk::Capture::ImageFormat::Jpeg;
  } else if (format == "png") {
    fmt = ::FreeKiosk::Capture::ImageFormat::Png;
  } else {
    promise.Reject("Unsupported format");
    return;
  }

  std::thread([fmt, quality, maxDimension, promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    ::FreeKiosk::Capture::Frame frame;
    std::string error;
    if (!::FreeKiosk::Capture::CapturePrimary(fmt, quality, maxDimension, frame, error)) {
      promise.Reject(error.c_str());
      return;
    }
    promise.Resolve(::FreeKiosk::Base64::Encode(frame.bytes.data(), frame.bytes.size()));
  }).detach();
}

void ScreenshotModule::getScreenInfo(int maxDimension,
                                     winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  SIZE screen = ::FreeKiosk::Capture::PrimaryScreenSize();
  SIZE frame = ::FreeKiosk::Capture::FitWithin(static_cast<int>(screen.cx), static_cast<int>(screen.cy), maxDimension);

  std::string json = "{\"screenWidth\":" + std::to_string(screen.cx) +
      ",\"screenHeight\":" + std::to_string(screen.cy) +
      ",\"frameWidth\":" + std::to_string(frame.cx) +
      ",\"frameHeight\":" + std::to_string(frame.cy) + "}";
  promise.Resolve(json);
}

} // namespace winrt::FreeKiosk::implementation
