#include "pch.h"
#include "Win32Util.h"

#include "NativeModules.h"
#include "JSValue.h"

#include <tlhelp32.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void Win32UtilModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void Win32UtilModule::getForegroundWindow(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["hwnd"] = JSValue((int)GetForegroundWindow());
  promise.Resolve(map);
}

void Win32UtilModule::getWindowTitle(int hwnd, ReactPromise<std::string> promise) noexcept {
  char title[256] = {};
  GetWindowTextA((HWND)hwnd, title, sizeof(title));
  promise.Resolve(std::string(title));
}

void Win32UtilModule::getWindowProcessId(int hwnd, ReactPromise<int> promise) noexcept {
  DWORD pid = 0;
  GetWindowThreadProcessId((HWND)hwnd, &pid);
  promise.Resolve((int)pid);
}

void Win32UtilModule::getProcessName(int pid, ReactPromise<std::string> promise) noexcept {
  HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (hSnapshot == INVALID_HANDLE_VALUE) {
    promise.Resolve("");
    return;
  }

  PROCESSENTRY32 pe32 = {};
  pe32.dwSize = sizeof(PROCESSENTRY32);

  std::string processName;
  if (Process32First(hSnapshot, &pe32)) {
    do {
      if (pe32.th32ProcessID == pid) {
        processName = pe32.szExeFile;
        break;
      }
    } while (Process32Next(hSnapshot, &pe32));
  }

  CloseHandle(hSnapshot);
  promise.Resolve(processName);
}

void Win32UtilModule::getScreenDimensions(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["width"] = JSValue((int)GetSystemMetrics(SM_CXSCREEN));
  map["height"] = JSValue((int)GetSystemMetrics(SM_CYSCREEN));
  promise.Resolve(map);
}

void Win32UtilModule::getCursorPosition(ReactPromise<JSValueObject> promise) noexcept {
  POINT pt;
  GetCursorPos(&pt);
  JSValueObject map;
  map["x"] = JSValue(pt.x);
  map["y"] = JSValue(pt.y);
  promise.Resolve(map);
}

void Win32UtilModule::simulateKeyPress(int vkCode, bool keyDown, ReactPromise<void> promise) noexcept {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = (WORD)vkCode;
  input.ki.dwFlags = keyDown ? 0 : KEYEVENTF_KEYUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void Win32UtilModule::simulateMouseClick(int x, int y, int button, ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void Win32UtilModule::sendTextInput(std::string text, ReactPromise<void> promise) noexcept {
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

} // namespace winrt::FreeKiosk::implementation
