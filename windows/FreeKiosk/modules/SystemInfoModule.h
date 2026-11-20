#pragma once

#include "NativeModules.h"
#include "JSValue.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(SystemInfoModule)
struct SystemInfoModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(getDeviceInfo)
  void getDeviceInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getBatteryInfo)
  void getBatteryInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getStorageInfo)
  void getStorageInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getMemoryInfo)
  void getMemoryInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getCpuInfo)
  void getCpuInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getNetworkInfo)
  void getNetworkInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getDisplayInfo)
  void getDisplayInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> promise) noexcept;

  REACT_METHOD(getUptime)
  void getUptime(winrt::Microsoft::ReactNative::ReactPromise<int64_t> promise) noexcept;

  REACT_METHOD(getHostname)
  void getHostname(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getMacAddress)
  void getMacAddress(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getIpAddress)
  void getIpAddress(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getSerialNumber)
  void getSerialNumber(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
