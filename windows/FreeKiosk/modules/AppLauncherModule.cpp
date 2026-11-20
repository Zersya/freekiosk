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

void AppLauncherModule::getInstalledApps(ReactPromise<std::map<std::string, std::string>> promise) noexcept {
  std::map<std::string, std::string> result;
  result["apps"] = "[]";
  promise.Resolve(result);
}

void AppLauncherModule::getAppInfo(std::string packageName, ReactPromise<std::map<std::string, std::string>> promise) noexcept {
  std::map<std::string, std::string> result;
  result["packageName"] = packageName;
  result["installed"] = "true";
  promise.Resolve(result);
}

void AppLauncherModule::isAppInstalled(std::string packageName, ReactPromise<bool> promise) noexcept {
  promise.Resolve(true);
}

void AppLauncherModule::killApp(std::string packageName, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AppLauncherModule::getRunningApps(ReactPromise<std::map<std::string, std::string>> promise) noexcept {
  std::map<std::string, std::string> result;
  result["apps"] = "[]";
  promise.Resolve(result);
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
