#include "pch.h"
#include "FilePickerModule.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.Pickers.h>
#include <winrt/Windows.Storage.h>

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::Storage::Pickers;
using namespace Windows::Storage;

void FilePickerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void FilePickerModule::pickFile(std::string filter, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickFiles(std::string filter, winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto vector = winrt::make<Windows::Foundation::Collections::IVector<IInspectable>>();
  promise.Resolve(vector);
}

void FilePickerModule::pickFolder(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

void FilePickerModule::pickSaveLocation(std::string defaultName, winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
