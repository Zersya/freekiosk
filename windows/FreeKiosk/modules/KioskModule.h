#pragma once

#include "NativeModules.h"
#include <string>
#include <map>
#include <mutex>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(KioskModule)
struct KioskModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  // Screen control
  REACT_METHOD(setScreenOn)
  void setScreenOn(bool on, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getScreenOn)
  void getScreenOn(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  // Brightness control
  REACT_METHOD(getBrightness)
  void getBrightness(winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(setBrightness)
  void setBrightness(int level, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Volume control
  REACT_METHOD(getVolume)
  void getVolume(winrt::Microsoft::ReactNative::ReactPromise<int> promise) noexcept;

  REACT_METHOD(setVolume)
  void setVolume(int level, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Kiosk mode
  REACT_METHOD(setKioskMode)
  void setKioskMode(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(isKioskModeEnabled)
  void isKioskModeEnabled(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(startLockTask)
  void startLockTask(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(stopLockTask)
  void stopLockTask(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(isInLockTaskMode)
  void isInLockTaskMode(winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  // App control
  REACT_METHOD(launchApp)
  void launchApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(launchUrl)
  void launchUrl(std::string url, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(launchFile)
  void launchFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // System info
  REACT_METHOD(getDeviceInfo)
  void getDeviceInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getBatteryInfo)
  void getBatteryInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getStorageInfo)
  void getStorageInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  // Window control
  REACT_METHOD(setAlwaysOnTop)
  void setAlwaysOnTop(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(setFullScreen)
  void setFullScreen(bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(minimize)
  void minimize(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(maximize)
  void maximize(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(restore)
  void restore(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(close)
  void close(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Power management
  REACT_METHOD(shutdown)
  void shutdown(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(restart)
  void restart(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sleep)
  void sleep(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(hibernate)
  void hibernate(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Input injection
  REACT_METHOD(sendKey)
  void sendKey(int vkCode, bool keyDown, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendMouseClick)
  void sendMouseClick(int x, int y, int button, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendMouseMove)
  void sendMouseMove(int x, int y, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(sendText)
  void sendText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Clipboard
  REACT_METHOD(getClipboardText)
  void getClipboardText(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(setClipboardText)
  void setClipboardText(std::string text, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Notifications
  REACT_METHOD(showNotification)
  void showNotification(std::string title, std::string message, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(hideNotification)
  void hideNotification(winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // File operations
  REACT_METHOD(readFile)
  void readFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(writeFile)
  void writeFile(std::string path, std::string content, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(fileExists)
  void fileExists(std::string path, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(deleteFile)
  void deleteFile(std::string path, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Registry
  REACT_METHOD(getRegistryValue)
  void getRegistryValue(std::string keyPath, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(setRegistryValue)
  void setRegistryValue(std::string keyPath, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Process control
  REACT_METHOD(getProcessList)
  void getProcessList(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(killProcess)
  void killProcess(int pid, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getProcessInfo)
  void getProcessInfo(int pid, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  // Network
  REACT_METHOD(getNetworkInfo)
  void getNetworkInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getWifiInfo)
  void getWifiInfo(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  // Time
  REACT_METHOD(getCurrentTime)
  void getCurrentTime(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(setSystemTime)
  void setSystemTime(int year, int month, int day, int hour, int minute, int second, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  // Misc
  REACT_METHOD(getEnvironmentVariable)
  void getEnvironmentVariable(std::string name, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(setEnvironmentVariable)
  void setEnvironmentVariable(std::string name, std::string value, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getCommandLine)
  void getCommandLine(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(executeCommand)
  void executeCommand(std::string command, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
