#include "pch.h"
#include "SystemInfoModule.h"

#include "NativeModules.h"

#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <lmcons.h>
#include <sysinfoapi.h>
#include <cctype>
#include <cstdio>
#include <winternl.h>

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

namespace {

std::string JsonEscape(std::string const &s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (unsigned char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out;
}

std::string WideToUtf8(std::wstring const &w) {
  if (w.empty()) return {};
  int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
  if (len <= 0) return {};
  std::string s(static_cast<size_t>(len), '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()), s.data(), len, nullptr, nullptr);
  return s;
}

std::string ReadRegString(HKEY root, wchar_t const *subKey, wchar_t const *value) {
  HKEY key;
  if (RegOpenKeyExW(root, subKey, 0, KEY_READ | KEY_WOW64_64KEY, &key) != ERROR_SUCCESS) {
    return {};
  }
  DWORD type = 0;
  DWORD size = 0;
  std::wstring result;
  if (RegQueryValueExW(key, value, nullptr, &type, nullptr, &size) == ERROR_SUCCESS && size > sizeof(wchar_t)) {
    result.resize(size / sizeof(wchar_t));
    RegQueryValueExW(key, value, nullptr, &type, reinterpret_cast<LPBYTE>(result.data()), &size);
    if (!result.empty() && result.back() == L'\0') {
      result.pop_back();
    }
  }
  RegCloseKey(key);
  return WideToUtf8(result);
}

} // namespace

void SystemInfoModule::getPlatformInfo(ReactPromise<std::string> promise) noexcept {
  // OS version via RtlGetVersion from ntdll.
  std::string osVersion;
  unsigned long osBuild = 0;
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (ntdll) {
    auto rtlGetVersion = reinterpret_cast<LONG(WINAPI *)(PRTL_OSVERSIONINFOW)>(
        GetProcAddress(ntdll, "RtlGetVersion"));
    if (rtlGetVersion) {
      RTL_OSVERSIONINFOW info = {};
      info.dwOSVersionInfoSize = sizeof(info);
      if (rtlGetVersion(&info) == 0) {
        osVersion = std::to_string(info.dwMajorVersion) + "." + std::to_string(info.dwMinorVersion) + "." +
            std::to_string(info.dwBuildNumber);
        osBuild = info.dwBuildNumber;
      }
    }
  }

  std::string manufacturer = ReadRegString(HKEY_LOCAL_MACHINE, L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                                           L"SystemManufacturer");
  std::string model = ReadRegString(HKEY_LOCAL_MACHINE, L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                                    L"SystemProductName");

  wchar_t computerName[MAX_COMPUTERNAME_LENGTH + 1] = {};
  DWORD computerNameLen = MAX_COMPUTERNAME_LENGTH + 1;
  std::string computerNameUtf8;
  if (GetComputerNameW(computerName, &computerNameLen)) {
    computerNameUtf8 = WideToUtf8(std::wstring(computerName, computerNameLen));
  }

  std::string machineId = ReadRegString(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Cryptography", L"MachineGuid");
  {
    std::string cleaned;
    for (char c : machineId) {
      if (c != '-') cleaned += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }
    if (cleaned.size() > 16) {
      cleaned.resize(16);
    }
    machineId = cleaned;
  }

  std::string json = "{\"osVersion\":\"" + JsonEscape(osVersion) + "\"" +
      ",\"osBuild\":" + std::to_string(osBuild) +
      ",\"manufacturer\":\"" + JsonEscape(manufacturer) + "\"" +
      ",\"model\":\"" + JsonEscape(model) + "\"" +
      ",\"computerName\":\"" + JsonEscape(computerNameUtf8) + "\"" +
      ",\"machineId\":\"" + JsonEscape(machineId) + "\"}";
  promise.Resolve(json);
}

} // namespace winrt::FreeKiosk::implementation
