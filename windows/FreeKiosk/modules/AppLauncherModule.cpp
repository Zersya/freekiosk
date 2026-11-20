#include "pch.h"
#include "AppLauncherModule.h"

#include "NativeModules.h"

#include <windows.h>
#include <shellapi.h>
#include <tlhelp32.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void AppLauncherModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void AppLauncherModule::launchApp(std::string packageName, ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", packageName.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void AppLauncherModule::launchAppWithArgs(std::string packageName, std::string args, ReactPromise<void> promise) noexcept {
  ShellExecuteA(nullptr, "open", packageName.c_str(), args.c_str(), nullptr, SW_SHOWNORMAL);
  promise.Resolve();
}

void AppLauncherModule::getInstalledApps(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("{\"apps\":[]}");
}

void AppLauncherModule::getAppInfo(std::string packageName, ReactPromise<std::string> promise) noexcept {
  std::string result = "{\"packageName\":\"" + packageName + "\",\"installed\":true}";
  promise.Resolve(result);
}

void AppLauncherModule::isAppInstalled(std::string packageName, ReactPromise<bool> promise) noexcept {
  promise.Resolve(true);
}

void AppLauncherModule::killApp(std::string packageName, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getRunningApps(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("{\"apps\":[]}");
}

void AppLauncherModule::setLaunchOnBoot(std::string packageName, bool enabled, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getLaunchOnBoot(std::string packageName, ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void AppLauncherModule::grantPermission(std::string packageName, std::string permission, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::revokePermission(std::string packageName, std::string permission, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

} // namespace winrt::FreeKiosk::implementation
