#include "pch.h"
#include "SystemInfoModule.h"

#include <winrt/Windows.Foundation.Collections.h>

#include <windows.h>
#include <iphlpapi.h>
#include <lmcons.h>
#include <sysinfoapi.h>

#pragma comment(lib, "iphlpapi.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;

void SystemInfoModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void SystemInfoModule::getDeviceInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"platform", winrt::box_value(L"windows"));
  map.Insert(L"version", winrt::box_value(L"1.0.0"));
  map.Insert(L"buildNumber", winrt::box_value(1));

  char hostname[MAX_COMPUTERNAME_LENGTH + 1];
  DWORD size = sizeof(hostname);
  if (GetComputerNameA(hostname, &size)) {
    map.Insert(L"hostname", winrt::box_value(std::wstring(hostname, hostname + size)));
  }

  promise.Resolve(map);
}

void SystemInfoModule::getBatteryInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  SYSTEM_POWER_STATUS status;
  if (GetSystemPowerStatus(&status)) {
    auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
    map.Insert(L"level", winrt::box_value((int)status.BatteryLifePercent));
    map.Insert(L"charging", winrt::box_value(status.ACLineStatus == 1));
    map.Insert(L"temperature", winrt::box_value(0));
    promise.Resolve(map);
  } else {
    promise.Resolve(nullptr);
  }
}

void SystemInfoModule::getStorageInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  ULARGE_INTEGER freeBytesAvailable, totalBytes, totalFreeBytes;
  if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvailable, &totalBytes, &totalFreeBytes)) {
    auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
    map.Insert(L"free", winrt::box_value((double)freeBytesAvailable.QuadPart / (1024.0 * 1024.0 * 1024.0)));
    map.Insert(L"total", winrt::box_value((double)totalBytes.QuadPart / (1024.0 * 1024.0 * 1024.0)));
    map.Insert(L"used", winrt::box_value((double)(totalBytes.QuadPart - totalFreeBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0)));
    promise.Resolve(map);
  } else {
    promise.Resolve(nullptr);
  }
}

void SystemInfoModule::getMemoryInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  MEMORYSTATUSEX memInfo = {};
  memInfo.dwLength = sizeof(memInfo);
  if (GlobalMemoryStatusEx(&memInfo)) {
    auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
    map.Insert(L"free", winrt::box_value((double)memInfo.ullAvailPhys / (1024.0 * 1024.0)));
    map.Insert(L"total", winrt::box_value((double)memInfo.ullTotalPhys / (1024.0 * 1024.0)));
    map.Insert(L"used", winrt::box_value((double)(memInfo.ullTotalPhys - memInfo.ullAvailPhys) / (1024.0 * 1024.0)));
    promise.Resolve(map);
  } else {
    promise.Resolve(nullptr);
  }
}

void SystemInfoModule::getCpuInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"usage", winrt::box_value(0));
  map.Insert(L"cores", winrt::box_value((int)GetActiveProcessorCount(ALL_PROCESSOR_GROUPS)));
  promise.Resolve(map);
}

void SystemInfoModule::getNetworkInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"platform", winrt::box_value(L"windows"));
  promise.Resolve(map);
}

void SystemInfoModule::getDisplayInfo(winrt::Microsoft::ReactNative::ReactPromise<IInspectable> promise) noexcept {
  auto map = winrt::make<Windows::Foundation::Collections::PropertySet>();
  map.Insert(L"width", winrt::box_value((int)GetSystemMetrics(SM_CXSCREEN)));
  map.Insert(L"height", winrt::box_value((int)GetSystemMetrics(SM_CYSCREEN)));
  map.Insert(L"dpi", winrt::box_value((int)GetDpiForSystem()));
  promise.Resolve(map);
}

void SystemInfoModule::getUptime(winrt::Microsoft::ReactNative::ReactPromise<int64_t> promise) noexcept {
  ULONGLONG uptime = GetTickCount64() / 1000;
  promise.Resolve((int64_t)uptime);
}

void SystemInfoModule::getHostname(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  char hostname[MAX_COMPUTERNAME_LENGTH + 1];
  DWORD size = sizeof(hostname);
  if (GetComputerNameA(hostname, &size)) {
    promise.Resolve(std::string(hostname, size));
  } else {
    promise.Resolve("");
  }
}

void SystemInfoModule::getMacAddress(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  IP_ADAPTER_INFO adapterInfo[16];
  DWORD bufLen = sizeof(adapterInfo);

  if (GetAdaptersInfo(adapterInfo, &bufLen) == ERROR_SUCCESS) {
    PIP_ADAPTER_INFO pAdapterInfo = adapterInfo;
    if (pAdapterInfo) {
      std::string mac;
      for (UINT i = 0; i < pAdapterInfo->AddressLength; i++) {
        if (i > 0) mac += ":";
        char buf[3];
        sprintf_s(buf, "%02X", pAdapterInfo->Address[i]);
        mac += buf;
      }
      promise.Resolve(mac);
      return;
    }
  }
  promise.Resolve("");
}

void SystemInfoModule::getIpAddress(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  char hostname[256];
  if (gethostname(hostname, sizeof(hostname)) == 0) {
    addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    addrinfo* result = nullptr;
    if (getaddrinfo(hostname, nullptr, &hints, &result) == 0) {
      for (addrinfo* ptr = result; ptr != nullptr; ptr = ptr->ai_next) {
        sockaddr_in* addr = (sockaddr_in*)ptr->ai_addr;
        char ipStr[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &addr->sin_addr, ipStr, INET_ADDRSTRLEN);
        freeaddrinfo(result);
        promise.Resolve(std::string(ipStr));
        return;
      }
      freeaddrinfo(result);
    }
  }
  promise.Resolve("127.0.0.1");
}

void SystemInfoModule::getSerialNumber(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
