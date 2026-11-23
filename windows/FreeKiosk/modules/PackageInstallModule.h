#pragma once

#include "NativeModules.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(PackageInstallModule)
struct PackageInstallModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(downloadFile)
  void downloadFile(std::string url, std::string fileName, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(installPackage)
  void installPackage(std::string path, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(removePackage)
  void removePackage(std::string name, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(listPackages)
  void listPackages(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(getSelfPackageName)
  void getSelfPackageName(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
