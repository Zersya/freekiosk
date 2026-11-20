#include "pch.h"
#include "BlockingOverlayModule.h"

#include "NativeModules.h"

#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

static std::map<int, std::map<std::string, std::string>> g_overlays;
static std::mutex g_overlaysMutex;

void BlockingOverlayModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void BlockingOverlayModule::showOverlay(int id, int x, int y, int width, int height, std::string color, ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);

  std::map<std::string, std::string> overlay;
  overlay["id"] = std::to_string(id);
  overlay["x"] = std::to_string(x);
  overlay["y"] = std::to_string(y);
  overlay["width"] = std::to_string(width);
  overlay["height"] = std::to_string(height);
  overlay["color"] = color;

  g_overlays[id] = overlay;
  promise.Resolve();
}

void BlockingOverlayModule::hideOverlay(int id, ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  g_overlays.erase(id);
  promise.Resolve();
}

void BlockingOverlayModule::clearOverlays(ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  g_overlays.clear();
  promise.Resolve();
}

void BlockingOverlayModule::getOverlays(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("{\"overlays\":[]}");
}

} // namespace winrt::FreeKiosk::implementation
