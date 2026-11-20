#include "pch.h"
#include "FilePickerModule.h"

#include "NativeModules.h"
#include "JSValue.h"

#include <winrt/Windows.Storage.Pickers.h>
#include <winrt/Windows.Storage.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void FilePickerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void FilePickerModule::pickFile(std::string filter, ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickFiles(std::string filter, ReactPromise<JSValue> promise) noexcept {
  JSValueObject result;
  result["files"] = JSValue(JSValueArray());
  promise.Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(result)));
}

void FilePickerModule::pickFolder(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickSaveLocation(std::string defaultName, ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
