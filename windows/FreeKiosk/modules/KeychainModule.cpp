#include "pch.h"
#include "KeychainModule.h"

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Windows.Foundation.Collections.h>

#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

static std::map<std::string, std::string> g_keychainStore;
static std::mutex g_keychainMutex;

void KeychainModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void KeychainModule::setItem(std::string key, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore[key] = value;
  promise.Resolve();
}

void KeychainModule::getItem(std::string key, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  auto it = g_keychainStore.find(key);
  if (it != g_keychainStore.end()) {
    promise.Resolve(it->second);
  } else {
    promise.Resolve("");
  }
}

void KeychainModule::removeItem(std::string key, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore.erase(key);
  promise.Resolve();
}

void KeychainModule::clear(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore.clear();
  promise.Resolve();
}

void KeychainModule::getAllKeys(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  auto vector = winrt::make<Windows::Foundation::Collections::IVector<IInspectable>>();
  for (auto& [key, value] : g_keychainStore) {
    vector.Append(winrt::box_value(std::wstring(key.begin(), key.end())));
  }
  promise.Resolve(vector);
}

} // namespace winrt::FreeKiosk::implementation
