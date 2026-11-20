#include "pch.h"
#include "AppLauncherModule.h"

#include <winrt/Windows.Foundation.Collections.h>

#include <windows.h>
#include <shellapi.h>
#include <tlhelp32.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

void AppLauncherModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void AppLauncherModule::launchApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", packageName.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void AppLauncherModule::launchAppWithArgs(std::string packageName, std::string args, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", packageName.c_str(), args.c_str(), nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void AppLauncherModule::getInstalledApps(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueObject result;
  result["apps"] = winrt::Microsoft::ReactNative::JSValue(winrt::Microsoft::ReactNative::JSValueArray());
  promise.Resolve(result);
}

void AppLauncherModule::getAppInfo(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueObject map;
  map["packageName"] = winrt::Microsoft::ReactNative::JSValue(packageName);
  map["installed"] = winrt::Microsoft::ReactNative::JSValue(true);
  promise.Resolve(map);
}

void AppLauncherModule::isAppInstalled(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(true);
}

void AppLauncherModule::killApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getRunningApps(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept {
  winrt::Microsoft::ReactNative::JSValueArray apps;

  HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (hSnapshot != INVALID_HANDLE_VALUE) {
    PROCESSENTRY32 pe32 = {};
    pe32.dwSize = sizeof(PROCESSENTRY32);

    if (Process32First(hSnapshot, &pe32)) {
      do {
        winrt::Microsoft::ReactNative::JSValueObject app;
        app["name"] = winrt::Microsoft::ReactNative::JSValue(std::string(pe32.szExeFile));
        app["pid"] = winrt::Microsoft::ReactNative::JSValue((int)pe32.th32ProcessID);
        apps.push_back(winrt::Microsoft::ReactNative::JSValue(std::move(app)));
      } while (Process32Next(hSnapshot, &pe32));
    }
    CloseHandle(hSnapshot);
  }

  winrt::Microsoft::ReactNative::JSValueObject result;
  result["apps"] = winrt::Microsoft::ReactNative::JSValue(std::move(apps));
  promise.Resolve(result);
}

void AppLauncherModule::setLaunchOnBoot(std::string packageName, bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getLaunchOnBoot(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void AppLauncherModule::grantPermission(std::string packageName, std::string permission, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::revokePermission(std::string packageName, std::string permission, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
