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

void AppLauncherModule::getInstalledApps(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto vector = winrt::make<Windows::Foundation::Collections::IVector<IInspectable>>();
  promise.Resolve(vector);
}

void AppLauncherModule::getAppInfo(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"packageName", winrt::box_value(std::wstring(packageName.begin(), packageName.end())));
  map.Insert(L"installed", winrt::box_value(true));
  promise.Resolve(map);
}

void AppLauncherModule::isAppInstalled(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept {
  promise.Resolve(true);
}

void AppLauncherModule::killApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getRunningApps(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto vector = winrt::make<Windows::Foundation::Collections::IVector<IInspectable>>();

  HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (hSnapshot != INVALID_HANDLE_VALUE) {
    PROCESSENTRY32 pe32 = {};
    pe32.dwSize = sizeof(PROCESSENTRY32);

    if (Process32First(hSnapshot, &pe32)) {
      do {
        auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
        map.Insert(L"name", winrt::box_value(std::wstring(pe32.szExeFile)));
        map.Insert(L"pid", winrt::box_value((int)pe32.th32ProcessID));
        vector.Append(map);
      } while (Process32Next(hSnapshot, &pe32));
    }
    CloseHandle(hSnapshot);
  }

  promise.Resolve(vector);
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
