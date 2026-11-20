#include "pch.h"
#include "SystemInfoModule.h"

#include "NativeModules.h"
#include "JSValue.h"

#include <windows.h>
#include <iphlpapi.h>
#include <lmcons.h>
#include <sysinfoapi.h>

#pragma comment(lib, "iphlpapi.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void SystemInfoModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void SystemInfoModule::getDeviceInfo(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["platform"] = JSValue(std::string("windows"));
  map["version"] = JSValue(std::string("1.0.0"));
  map["buildNumber"] = JSValue(1);

  char hostname[MAX_COMPUTERNAME_LENGTH + 1];
  DWORD size = sizeof(hostname);
  if (GetComputerNameA(hostname, &size)) {
    map["hostname"] = JSValue(std::string(hostname, size));
  }

  promise.Resolve(map);
}

void SystemInfoModule::getBatteryInfo(ReactPromise<JSValueObject> promise) noexcept {
  SYSTEM_POWER_STATUS status;
  if (GetSystemPowerStatus(&status)) {
    JSValueObject map;
    map["level"] = JSValue((int)status.BatteryLifePercent);
    map["charging"] = JSValue(status.ACLineStatus == 1);
    map["temperature"] = JSValue(0);
    promise.Resolve(map);
  } else {
    promise.Resolve(JSValueObject());
  }
}

void SystemInfoModule::getStorageInfo(ReactPromise<JSValueObject> promise) noexcept {
  ULARGE_INTEGER freeBytesAvailable, totalBytes, totalFreeBytes;
  if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvailable, &totalBytes, &totalFreeBytes)) {
    JSValueObject map;
    map["free"] = JSValue((double)freeBytesAvailable.QuadPart / (1024.0 * 1024.0 * 1024.0));
    map["total"] = JSValue((double)totalBytes.QuadPart / (1024.0 * 1024.0 * 1024.0));
    map["used"] = JSValue((double)(totalBytes.QuadPart - totalFreeBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0));
    promise.Resolve(map);
  } else {
    promise.Resolve(JSValueObject());
  }
}

void SystemInfoModule::getMemoryInfo(ReactPromise<JSValueObject> promise) noexcept {
  MEMORYSTATUSEX memInfo = {};
  memInfo.dwLength = sizeof(memInfo);
  if (GlobalMemoryStatusEx(&memInfo)) {
    JSValueObject map;
    map["free"] = JSValue((double)memInfo.ullAvailPhys / (1024.0 * 1024.0));
    map["total"] = JSValue((double)memInfo.ullTotalPhys / (1024.0 * 1024.0));
    map["used"] = JSValue((double)(memInfo.ullTotalPhys - memInfo.ullAvailPhys) / (1024.0 * 1024.0));
    promise.Resolve(map);
  } else {
    promise.Resolve(JSValueObject());
  }
}

void SystemInfoModule::getCpuInfo(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["usage"] = JSValue(0);
  map["cores"] = JSValue((int)GetActiveProcessorCount(ALL_PROCESSOR_GROUPS));
  promise.Resolve(map);
}

void SystemInfoModule::getNetworkInfo(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["platform"] = JSValue(std::string("windows"));
  promise.Resolve(map);
}

void SystemInfoModule::getDisplayInfo(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject map;
  map["width"] = JSValue((int)GetSystemMetrics(SM_CXSCREEN));
  map["height"] = JSValue((int)GetSystemMetrics(SM_CYSCREEN));
  map["dpi"] = JSValue((int)GetDpiForSystem());
  promise.Resolve(map);
}

void SystemInfoModule::getUptime(ReactPromise<int64_t> promise) noexcept {
  ULONGLONG uptime = GetTickCount64() / 1000;
  promise.Resolve((int64_t)uptime);
}

void SystemInfoModule::getHostname(ReactPromise<std::string> promise) noexcept {
  char hostname[MAX_COMPUTERNAME_LENGTH + 1];
  DWORD size = sizeof(hostname);
  if (GetComputerNameA(hostname, &size)) {
    promise.Resolve(std::string(hostname, size));
  } else {
    promise.Resolve("");
  }
}

void SystemInfoModule::getMacAddress(ReactPromise<std::string> promise) noexcept {
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

void SystemInfoModule::getIpAddress(ReactPromise<std::string> promise) noexcept {
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

void SystemInfoModule::getSerialNumber(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("");
}

} // namespace winrt::FreeKiosk::implementation
