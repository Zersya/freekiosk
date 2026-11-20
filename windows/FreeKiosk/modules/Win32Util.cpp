#include "pch.h"
#include "Win32Util.h"

#include <winrt/Windows.Foundation.Collections.h>

#include <tlhelp32.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

void Win32UtilModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void Win32UtilModule::getForegroundWindow(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"hwnd", winrt::box_value((int)GetForegroundWindow()));
  promise.Resolve(map);
}

void Win32UtilModule::getWindowTitle(int hwnd, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  char title[256] = {};
  GetWindowTextA((HWND)hwnd, title, sizeof(title));
  promise.Resolve(std::string(title));
}

void Win32UtilModule::getWindowProcessId(int hwnd, winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept {
  DWORD pid = 0;
  GetWindowThreadProcessId((HWND)hwnd, &pid);
  promise.Resolve((int)pid);
}

void Win32UtilModule::getProcessName(int pid, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
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

void Win32UtilModule::getScreenDimensions(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"width", winrt::box_value((int)GetSystemMetrics(SM_CXSCREEN)));
  map.Insert(L"height", winrt::box_value((int)GetSystemMetrics(SM_CYSCREEN)));
  promise.Resolve(map);
}

void Win32UtilModule::getCursorPosition(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  POINT pt;
  GetCursorPos(&pt);
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"x", winrt::box_value(pt.x));
  map.Insert(L"y", winrt::box_value(pt.y));
  promise.Resolve(map);
}

void Win32UtilModule::simulateKeyPress(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = (WORD)vkCode;
  input.ki.dwFlags = keyDown ? 0 : KEYEVENTF_KEYUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void Win32UtilModule::simulateMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void Win32UtilModule::sendTextInput(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
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
