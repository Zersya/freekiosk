#include "pch.h"
#include "KeychainModule.h"

#include "NativeModules.h"

#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

static std::map<std::string, std::string> g_keychainStore;
static std::mutex g_keychainMutex;

void KeychainModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void KeychainModule::setItem(std::string key, std::string value, ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore[key] = value;
  promise.Resolve();
}

void KeychainModule::getItem(std::string key, ReactPromise<std::string> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  auto it = g_keychainStore.find(key);
  if (it != g_keychainStore.end()) {
    promise.Resolve(it->second);
  } else {
    promise.Resolve("");
  }
}

void KeychainModule::removeItem(std::string key, ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore.erase(key);
  promise.Resolve();
}

void KeychainModule::clear(ReactPromise<void> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  g_keychainStore.clear();
  promise.Resolve();
}

void KeychainModule::getAllKeys(ReactPromise<std::map<std::string, std::string>> promise) noexcept {
  std::lock_guard<std::mutex> lock(g_keychainMutex);
  std::map<std::string, std::string> result;
  result["keys"] = "[]";
  promise.Resolve(result);
}

} // namespace winrt::FreeKiosk::implementation
