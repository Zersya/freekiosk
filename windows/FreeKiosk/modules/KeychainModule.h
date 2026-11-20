#pragma once

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Microsoft.ReactNative.Cxx.h>
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(KeychainModule)
struct KeychainModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(setItem)
  void setItem(std::string key, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getItem)
  void getItem(std::string key, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(removeItem)
  void removeItem(std::string key, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(clear)
  void clear(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getAllKeys)
  void getAllKeys(winrt::Microsoft::ReactNative::ReactPromise<winrt::Windows::Foundation::IInspectable> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
