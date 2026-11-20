#include "pch.h"
#include "KioskModule.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.System.Diagnostics.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.UI.Notifications.h>

#include <windows.h>
#include <shellapi.h>
#include <mmsystem.h>
#include <powrprof.h>
#include <iphlpapi.h>
#include <lmcons.h>
#include <fstream>
#include <filesystem>

#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "powrprof.lib")
#pragma comment(lib, "iphlpapi.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::System;
using namespace Windows::System::Diagnostics;
using namespace Windows::Storage;
using namespace Windows::UI::Notifications;

void KioskModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

// Screen control
void KioskModule::setScreenOn(bool on, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  if (on) {
    SetThreadExecutionState(ES_DISPLAY_REQUIRED | ES_CONTINUOUS);
  } else {
    SetThreadExecutionState(ES_CONTINUOUS);
  }
  promise.Resolve();
}

void KioskModule::getScreenOn(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(true);
}

// Brightness control
void KioskModule::getBrightness(winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept {
  promise.Resolve(50);
}

void KioskModule::setBrightness(int level, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  level = std::max(0, std::min(100, level));
  promise.Resolve();
}

// Volume control
void KioskModule::getVolume(winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept {
  HWAVEOUT hWaveOut;
  if (waveOutOpen(&hWaveOut, WAVE_MAPPER, nullptr, 0, 0, CALLBACK_NULL) == MMSYSERR_NOERROR) {
    DWORD volume = 0;
    waveOutGetVolume(hWaveOut, &volume);
    waveOutClose(hWaveOut);
    int level = ((volume & 0xFFFF) * 100) / 0xFFFF;
    promise.Resolve(level);
  } else {
    promise.Resolve(50);
  }
}

void KioskModule::setVolume(int level, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  level = std::max(0, std::min(100, level));
  DWORD volume = (level * 0xFFFF) / 100;
  volume = (volume << 16) | volume;

  HWAVEOUT hWaveOut;
  if (waveOutOpen(&hWaveOut, WAVE_MAPPER, nullptr, 0, 0, CALLBACK_NULL) == MMSYSERR_NOERROR) {
    waveOutSetVolume(hWaveOut, volume);
    waveOutClose(hWaveOut);
    promise.Resolve();
  } else {
    promise.Reject("Failed to set volume");
  }
}

// Kiosk mode
void KioskModule::setKioskMode(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::isKioskModeEnabled(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void KioskModule::startLockTask(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::stopLockTask(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::isInLockTaskMode(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

// App control
void KioskModule::launchApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", packageName.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void KioskModule::launchUrl(std::string url, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void KioskModule::launchFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", path.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

// System info
void KioskModule::getDeviceInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueObject map;
  map["platform"] = winrt::Microsoft::ReactNative::JSValue(std::string("windows"));
  map["version"] = winrt::Microsoft::ReactNative::JSValue(std::string("1.0.0"));
  map["buildNumber"] = winrt::Microsoft::ReactNative::JSValue(1);
  promise.Resolve(map);
}

void KioskModule::getBatteryInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  SYSTEM_POWER_STATUS status;
  if (GetSystemPowerStatus(&status)) {
    winrt::Microsoft::ReactNative::JSValueObject map;
    map["level"] = winrt::Microsoft::ReactNative::JSValue((int)status.BatteryLifePercent);
    map["charging"] = winrt::Microsoft::ReactNative::JSValue(status.ACLineStatus == 1);
    promise.Resolve(map);
  } else {
    promise.Resolve(winrt::Microsoft::ReactNative::JSValueObject());
  }
}

void KioskModule::getStorageInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  ULARGE_INTEGER freeBytesAvailable, totalBytes, totalFreeBytes;
  if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvailable, &totalBytes, &totalFreeBytes)) {
    winrt::Microsoft::ReactNative::JSValueObject map;
    map["free"] = winrt::Microsoft::ReactNative::JSValue((double)freeBytesAvailable.QuadPart / (1024.0 * 1024.0 * 1024.0));
    map["total"] = winrt::Microsoft::ReactNative::JSValue((double)totalBytes.QuadPart / (1024.0 * 1024.0 * 1024.0));
    promise.Resolve(map);
  } else {
    promise.Resolve(winrt::Microsoft::ReactNative::JSValueObject());
  }
}

// Window control
void KioskModule::setAlwaysOnTop(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::setFullScreen(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::minimize(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::maximize(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::restore(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::close(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

// Power management
void KioskModule::shutdown(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::restart(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::sleep(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetSuspendState(FALSE, FALSE, FALSE);
  promise.Resolve();
}

void KioskModule::hibernate(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetSuspendState(TRUE, FALSE, FALSE);
  promise.Resolve();
}

// Input injection
void KioskModule::sendKey(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = (WORD)vkCode;
  input.ki.dwFlags = keyDown ? 0 : KEYEVENTF_KEYUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void KioskModule::sendMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP;
  SendInput(1, &input, sizeof(INPUT));
  promise.Resolve();
}

void KioskModule::sendMouseMove(int x, int y, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  SetCursorPos(x, y);
  promise.Resolve();
}

void KioskModule::sendText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
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

// Clipboard
void KioskModule::getClipboardText(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  if (!OpenClipboard(nullptr)) {
    promise.Reject("Failed to open clipboard");
    return;
  }

  HANDLE hData = GetClipboardData(CF_TEXT);
  if (hData) {
    char* pszText = static_cast<char*>(GlobalLock(hData));
    std::string text = pszText ? pszText : "";
    GlobalUnlock(hData);
    CloseClipboard();
    promise.Resolve(text);
  } else {
    CloseClipboard();
    promise.Resolve("");
  }
}

void KioskModule::setClipboardText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  if (!OpenClipboard(nullptr)) {
    promise.Reject("Failed to open clipboard");
    return;
  }

  EmptyClipboard();
  HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, text.length() + 1);
  if (hMem) {
    char* pMem = static_cast<char*>(GlobalLock(hMem));
    strcpy_s(pMem, text.length() + 1, text.c_str());
    GlobalUnlock(hMem);
    SetClipboardData(CF_TEXT, hMem);
  }
  CloseClipboard();
  promise.Resolve();
}

// Notifications
void KioskModule::showNotification(std::string title, std::string message, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void KioskModule::hideNotification(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

// File operations
void KioskModule::readFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::ifstream file(path, std::ios::binary);
  if (!file.is_open()) {
    promise.Reject(("Failed to open file: " + path).c_str());
    return;
  }

  std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  file.close();
  promise.Resolve(content);
}

void KioskModule::writeFile(std::string path, std::string content, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  std::ofstream file(path, std::ios::binary | std::ios::trunc);
  if (!file.is_open()) {
    promise.Reject(("Failed to open file for writing: " + path).c_str());
    return;
  }

  file.write(content.c_str(), content.length());
  file.close();
  promise.Resolve();
}

void KioskModule::fileExists(std::string path, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(std::filesystem::exists(path));
}

void KioskModule::deleteFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  try {
    std::filesystem::remove(path);
    promise.Resolve();
  } catch (...) {
    promise.Reject(("Failed to delete file: " + path).c_str());
  }
}

// Registry
void KioskModule::getRegistryValue(std::string keyPath, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void KioskModule::setRegistryValue(std::string keyPath, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

// Process control
void KioskModule::getProcessList(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueObject result;
  result["processes"] = winrt::Microsoft::ReactNative::JSValue(winrt::Microsoft::ReactNative::JSValueArray());
  promise.Resolve(result);
}

void KioskModule::killProcess(int pid, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  HANDLE hProcess = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
  if (hProcess) {
    TerminateProcess(hProcess, 0);
    CloseHandle(hProcess);
    promise.Resolve();
  } else {
    promise.Reject(("Failed to kill process: " + std::to_string(pid)).c_str());
  }
}

void KioskModule::getProcessInfo(int pid, winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  promise.Resolve(winrt::Microsoft::ReactNative::JSValueObject());
}

// Network
void KioskModule::getNetworkInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueObject map;
  map["platform"] = winrt::Microsoft::ReactNative::JSValue(std::string("windows"));
  promise.Resolve(map);
}

void KioskModule::getWifiInfo(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  promise.Resolve(winrt::Microsoft::ReactNative::JSValueObject());
}

// Time
void KioskModule::getCurrentTime(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  auto now = std::chrono::system_clock::now();
  auto time = std::chrono::system_clock::to_time_t(now);
  char buf[64];
  ctime_s(buf, sizeof(buf), &time);
  promise.Resolve(std::string(buf));
}

void KioskModule::setSystemTime(int year, int month, int day, int hour, int minute, int second, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

// Misc
void KioskModule::getEnvironmentVariable(std::string name, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  char* value = nullptr;
  size_t len = 0;
  _dupenv_s(&value, &len, name.c_str());
  if (value) {
    promise.Resolve(std::string(value));
    free(value);
  } else {
    promise.Resolve("");
  }
}

void KioskModule::setEnvironmentVariable(std::string name, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  _putenv_s(name.c_str(), value.c_str());
  promise.Resolve();
}

void KioskModule::getCommandLine(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve(GetCommandLineA());
}

void KioskModule::executeCommand(std::string command, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
