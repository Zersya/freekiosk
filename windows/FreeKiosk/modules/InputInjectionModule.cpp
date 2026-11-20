#include "pch.h"
#include "InputInjectionModule.h"

#include <winrt/Microsoft.ReactNative.h>

#include <windows.h>

namespace winrt::FreeKiosk::implementation {

void InputInjectionModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void InputInjectionModule::sendKey(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = (WORD)vkCode;
  input.ki.dwFlags = keyDown ? 0 : KEYEVENTF_KEYUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void InputInjectionModule::sendKeyCombo(std::string keys, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void InputInjectionModule::sendText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  for (char c : text) {
    INPUT input = {};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = (WORD)c;
    input.ki.dwFlags = 0;
    SendInput(1, &input, sizeof(INPUT));

    input.ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(1, &input, sizeof(INPUT));
  }
  promise.Resolve();
}

void InputInjectionModule::sendMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);

  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void InputInjectionModule::sendMouseMove(int x, int y, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);
  promise.Resolve();
}

void InputInjectionModule::sendMouseScroll(int delta, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_WHEEL;
  input.mi.mouseData = delta;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
