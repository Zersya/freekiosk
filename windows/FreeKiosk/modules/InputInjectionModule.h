#pragma once

#include <winrt/Microsoft.ReactNative.h>
#include <winrt/Microsoft.ReactNative.Cxx.h>
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(InputInjectionModule)
struct InputInjectionModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(sendKey)
  void sendKey(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendKeyCombo)
  void sendKeyCombo(std::string keys, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendText)
  void sendText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendMouseClick)
  void sendMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendMouseMove)
  void sendMouseMove(int x, int y, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendMouseScroll)
  void sendMouseScroll(int delta, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
