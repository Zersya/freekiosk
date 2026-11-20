#include "pch.h"
#include "SystemInfoModule.h"

#include "NativeModules.h"

#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <lmcons.h>
#include <sysinfoapi.h>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void SystemInfoModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void SystemInfoModule::getDeviceInfo(ReactPromise<std::string> promise) noexcept {
  std::string result = "{\"platform\":\"windows\",\"version\":\"1.0.0\",\"buildNumber\":\"1\"";

  char hostname[MAX_COMPUTERNAME_LENGTH + 1];
  DWORD size = sizeof(hostname);
  if (GetComputerNameA(hostname, &size)) {
    result += ",\"hostname\":\"" + std::string(hostname, size) + "\"";
  }
  result += "}";
  promise.Resolve(result);
}

void SystemInfoModule::getBatteryInfo(ReactPromise<std::string> promise) noexcept {
  SYSTEM_POWER_STATUS status;
  if (GetSystemPowerStatus(&status)) {
    std::string result = "{\"level\":" + std::to_string((int)status.BatteryLifePercent) + ",\"charging\":" + (status.ACLineStatus == 1 ? "true" : "false") + ",\"temperature\":\"0\"}";
    promise.Resolve(result);
  } else {
    promise.Resolve("{}");
  }
}

void SystemInfoModule::getStorageInfo(ReactPromise<std::string> promise) noexcept {
  ULARGE_INTEGER freeBytesAvailable, totalBytes, totalFreeBytes;
  if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvailable, &totalBytes, &totalFreeBytes)) {
    std::string result = "{\"free\":" + std::to_string((double)freeBytesAvailable.QuadPart / (1024.0 * 1024.0 * 1024.0)) + ",\"total\":" + std::to_string((double)totalBytes.QuadPart / (1024.0 * 1024.0 * 1024.0)) + ",\"used\":" + std::to_string((double)(totalBytes.QuadPart - totalFreeBytes.QuadPart) / (1024.0 * 1024.0 * 1024.0)) + "}";
    promise.Resolve(result);
  } else {
    promise.Resolve("{}");
  }
}

void SystemInfoModule::getMemoryInfo(ReactPromise<std::string> promise) noexcept {
  MEMORYSTATUSEX memInfo = {};
  memInfo.dwLength = sizeof(memInfo);
  if (GlobalMemoryStatusEx(&memInfo)) {
    std::string result = "{\"free\":" + std::to_string((double)memInfo.ullAvailPhys / (1024.0 * 1024.0)) + ",\"total\":" + std::to_string((double)memInfo.ullTotalPhys / (1024.0 * 1024.0)) + ",\"used\":" + std::to_string((double)(memInfo.ullTotalPhys - memInfo.ullAvailPhys) / (1024.0 * 1024.0)) + "}";
    promise.Resolve(result);
  } else {
    promise.Resolve("{}");
  }
}

void SystemInfoModule::getCpuInfo(ReactPromise<std::string> promise) noexcept {
  std::string result = "{\"usage\":\"0\",\"cores\":\"" + std::to_string((int)GetActiveProcessorCount(ALL_PROCESSOR_GROUPS)) + "\"}";
  promise.Resolve(result);
}

void SystemInfoModule::getNetworkInfo(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("{\"platform\":\"windows\"}");
}

void SystemInfoModule::getDisplayInfo(ReactPromise<std::string> promise) noexcept {
  std::string result = "{\"width\":" + std::to_string((int)GetSystemMetrics(SM_CXSCREEN)) + ",\"height\":" + std::to_string((int)GetSystemMetrics(SM_CYSCREEN)) + ",\"dpi\":\"" + std::to_string((int)GetDpiForSystem()) + "\"}";
  promise.Resolve(result);
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
