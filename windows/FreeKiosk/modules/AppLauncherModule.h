#pragma once

#include "NativeModules.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(AppLauncherModule)
struct AppLauncherModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(launchApp)
  void launchApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(launchAppWithArgs)
  void launchAppWithArgs(std::string packageName, std::string args, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getInstalledApps)
  void getInstalledApps(winrt::Microsoft::ReactNative::ReactPromise<std::map<std::string, std::string>> promise) noexcept;

  REACT_METHOD(getAppInfo)
  void getAppInfo(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<std::map<std::string, std::string>> promise) noexcept;

  REACT_METHOD(isAppInstalled)
  void isAppInstalled(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(killApp)
  void killApp(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getRunningApps)
  void getRunningApps(winrt::Microsoft::ReactNative::ReactPromise<std::map<std::string, std::string>> promise) noexcept;

  REACT_METHOD(setLaunchOnBoot)
  void setLaunchOnBoot(std::string packageName, bool enabled, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(getLaunchOnBoot)
  void getLaunchOnBoot(std::string packageName, winrt::Microsoft::ReactNative::ReactPromise<bool> promise) noexcept;

  REACT_METHOD(grantPermission)
  void grantPermission(std::string packageName, std::string permission, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  REACT_METHOD(revokePermission)
  void revokePermission(std::string packageName, std::string permission, winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
