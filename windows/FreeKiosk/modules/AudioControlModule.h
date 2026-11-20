#pragma once

#include "NativeModules.h"
#include "JSValue.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(AudioControlModule)
struct AudioControlModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(getVolume)
  void getVolume(winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(setVolume)
  void setVolume(int level, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getMute)
  void getMute(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(setMute)
  void setMute(bool muted, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getAudioDevices)
  void getAudioDevices(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept;

  REACT_METHOD(setAudioDevice)
  void setAudioDevice(std::string deviceId, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getAudioOutput)
  void getAudioOutput(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
