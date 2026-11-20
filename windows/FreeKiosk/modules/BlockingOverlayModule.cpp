#include "pch.h"
#include "BlockingOverlayModule.h"

#include <winrt/Windows.Foundation.Collections.h>

#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

static std::map<int, IInspectable> g_overlays;
static std::mutex g_overlaysMutex;

void BlockingOverlayModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void BlockingOverlayModule::showOverlay(int id, int x, int y, int width, int height, std::string color, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);

  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"id", winrt::box_value(id));
  map.Insert(L"x", winrt::box_value(x));
  map.Insert(L"y", winrt::box_value(y));
  map.Insert(L"width", winrt::box_value(width));
  map.Insert(L"height", winrt::box_value(height));
  map.Insert(L"color", winrt::box_value(std::wstring(color.begin(), color.end())));

  g_overlays[id] = map;
  promise.Resolve();
}

void BlockingOverlayModule::hideOverlay(int id, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  g_overlays.erase(id);
  promise.Resolve();
}

void BlockingOverlayModule::clearOverlays(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  g_overlays.clear();
  promise.Resolve();
}

void BlockingOverlayModule::getOverlays(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_overlaysMutex);
  auto vector = winrt::make<Windows::Foundation::Collections::IVector<IInspectable>>();
  for (auto& [id, overlay] : g_overlays) {
    vector.Append(overlay);
  }
  promise.Resolve(vector);
}

} // namespace winrt::FreeKiosk::implementation
