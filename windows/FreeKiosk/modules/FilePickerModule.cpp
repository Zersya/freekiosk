#include "pch.h"
#include "FilePickerModule.h"

#include "NativeModules.h"

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void FilePickerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void FilePickerModule::pickFile(std::string filter, ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickFiles(std::string filter, ReactPromise<std::map<std::string, std::string>> promise) noexcept {
  std::map<std::string, std::string> result;
  result["files"] = "[]";
  promise.Resolve(result);
}

void FilePickerModule::pickFolder(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickSaveLocation(std::string defaultName, ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
