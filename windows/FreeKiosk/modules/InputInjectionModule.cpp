#include "pch.h"
#include "InputInjectionModule.h"

#include <windows.h>
#include <atomic>
#include <cmath>
#include <thread>
#include <string>

#include "ScreenCapture.h"

namespace {

// InitializeTouchInjection must be called once per process before injecting.
bool EnsureTouchInjection() {
  static std::atomic<bool> attempted{false};
  static std::atomic<bool> initialized{false};
  if (!attempted.exchange(true)) {
    initialized = InitializeTouchInjection(1, TOUCH_FEEDBACK_NONE) != FALSE;
  }
  return initialized.load();
}

POINTER_TOUCH_INFO MakeTouchInfo(int px, int py, POINTER_FLAGS flags) {
  POINTER_TOUCH_INFO info = {};
  info.pointerInfo.pointerType = PT_TOUCH;
  info.pointerInfo.pointerId = 0;
  info.pointerInfo.frameId = 0;
  info.pointerInfo.pointerFlags = flags;
  info.pointerInfo.ptPixelLocation.x = px;
  info.pointerInfo.ptPixelLocation.y = py;
  info.touchFlags = TOUCH_FLAG_NONE;
  info.touchMask = TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE;
  info.rcContact.left = px - 2;
  info.rcContact.right = px + 2;
  info.rcContact.top = py - 2;
  info.rcContact.bottom = py + 2;
  info.orientation = 90;
  info.pressure = 32000;
  return info;
}

} // namespace

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

void InputInjectionModule::tap(double xNorm, double yNorm, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::thread([xNorm, yNorm, promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    if (!EnsureTouchInjection()) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }

    SIZE screen = ::FreeKiosk::Capture::PrimaryScreenSize();
    int px = static_cast<int>(std::lround(xNorm * (screen.cx - 1)));
    int py = static_cast<int>(std::lround(yNorm * (screen.cy - 1)));

    POINTER_TOUCH_INFO info = MakeTouchInfo(px, py, POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
    if (!InjectTouchInput(1, &info)) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }
    Sleep(50);
    info.pointerInfo.pointerFlags = POINTER_FLAG_UP;
    if (!InjectTouchInput(1, &info)) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }
    promise.Resolve();
  }).detach();
}

void InputInjectionModule::swipe(double x1, double y1, double x2, double y2, int durationMs,
                                 winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::thread([x1, y1, x2, y2, durationMs, promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    if (!EnsureTouchInjection()) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }

    SIZE screen = ::FreeKiosk::Capture::PrimaryScreenSize();
    int px1 = static_cast<int>(std::lround(x1 * (screen.cx - 1)));
    int py1 = static_cast<int>(std::lround(y1 * (screen.cy - 1)));
    int px2 = static_cast<int>(std::lround(x2 * (screen.cx - 1)));
    int py2 = static_cast<int>(std::lround(y2 * (screen.cy - 1)));

    POINTER_TOUCH_INFO info = MakeTouchInfo(px1, py1, POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
    if (!InjectTouchInput(1, &info)) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }

    const int steps = 20;
    int stepDelay = durationMs / steps;
    for (int i = 1; i <= steps; i++) {
      double t = static_cast<double>(i) / steps;
      int px = static_cast<int>(std::lround(px1 + (px2 - px1) * t));
      int py = static_cast<int>(std::lround(py1 + (py2 - py1) * t));
      if (stepDelay > 0) {
        Sleep(stepDelay);
      }
      info = MakeTouchInfo(px, py, POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
      if (!InjectTouchInput(1, &info)) {
        promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
        return;
      }
    }

    info.pointerInfo.pointerFlags = POINTER_FLAG_UP;
    if (!InjectTouchInput(1, &info)) {
      promise.Reject(("Touch injection failed: " + std::to_string(GetLastError())).c_str());
      return;
    }
    promise.Resolve();
  }).detach();
}

void InputInjectionModule::sendKeyCombo(std::string keys, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void InputInjectionModule::sendText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  // UTF-8 -> UTF-16
  int wideLen = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0);
  if (wideLen <= 0) {
    promise.Resolve();
    return;
  }
  std::wstring wide(static_cast<size_t>(wideLen), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), wide.data(), wideLen);

  for (wchar_t unit : wide) {
    INPUT input = {};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = 0;
    input.ki.wScan = static_cast<WORD>(unit);
    input.ki.dwFlags = KEYEVENTF_UNICODE;
    SendInput(1, &input, sizeof(INPUT));

    input.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
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
