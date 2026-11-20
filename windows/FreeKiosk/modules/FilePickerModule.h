#pragma once

#include "NativeModules.h"
#include "JSValue.h"
#include <string>

namespace winrt::FreeKiosk::implementation {

REACT_MODULE(FilePickerModule)
struct FilePickerModule {
  using ModuleSpec = void;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(pickFile)
  void pickFile(std::string filter, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(pickFiles)
  void pickFiles(std::string filter, winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValueObject> promise) noexcept;

  REACT_METHOD(pickFolder)
  void pickFolder(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  REACT_METHOD(pickSaveLocation)
  void pickSaveLocation(std::string defaultName, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept;

  winrt::Microsoft::ReactNative::ReactContext m_reactContext;
};

} // namespace winrt::FreeKiosk::implementation
