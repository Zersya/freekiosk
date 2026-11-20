#include "pch.h"
#include "BlockingOverlayModule.h"

#include "NativeModules.h"
#include "JSValue.h"

#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

static std::map<int, JSValueObject> g_overlays;
static std::mutex g_overlaysMutex;

void BlockingOverlayModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void BlockingOverlayModule::showOverlay(int id, int x, int y, int width, int height, std::string color, ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);

  JSValueObject overlay;
  overlay["id"] = JSValue(id);
  overlay["x"] = JSValue(x);
  overlay["y"] = JSValue(y);
  overlay["width"] = JSValue(width);
  overlay["height"] = JSValue(height);
  overlay["color"] = JSValue(color);

  g_overlays[id] = std::move(overlay);
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

void BlockingOverlayModule::getOverlays(ReactPromise<JSValue> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  JSValueObject result;
  JSValueArray overlays;
  for (auto& [id, overlay] : g_overlays) {
    overlays.push_back(JSValue(overlay.Copy()));
  }
  result["overlays"] = JSValue(std::move(overlays));
  promise.Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(result)));
}

} // namespace winrt::FreeKiosk::implementation
