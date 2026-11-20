#pragma once

#include "NativeModules.h"
#include "JSValue.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(Win32UtilModule)
struct Win32UtilModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(getForegroundWindow)
  void getForegroundWindow(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept;

  REACT_METHOD(getWindowTitle)
  void getWindowTitle(int hwnd, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getWindowProcessId)
  void getWindowProcessId(int hwnd, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(getProcessName)
  void getProcessName(int pid, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getScreenDimensions)
  void getScreenDimensions(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept;

  REACT_METHOD(getCursorPosition)
  void getCursorPosition(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept;

  REACT_METHOD(simulateKeyPress)
  void simulateKeyPress(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(simulateMouseClick)
  void simulateMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendTextInput)
  void sendTextInput(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
