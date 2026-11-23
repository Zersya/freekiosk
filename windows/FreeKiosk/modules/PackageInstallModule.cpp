#include "pch.h"
#include "PackageInstallModule.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <set>
#include <string>
#include <thread>
#include <vector>


#pragma comment(lib, "windowsapp.lib")
namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Management::Deployment;
using namespace winrt::Windows::ApplicationModel;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Streams;
using namespace winrt::Windows::Web::Http;
using namespace winrt::Windows::Security::Cryptography;
using namespace winrt::Windows::Security::Cryptography::Core;

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

std::string WideToUtf8(winrt::hstring const &h) {
  std::wstring_view w(h);
  if (w.empty()) return {};
  int len = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
  if (len <= 0) return {};
  std::string s(static_cast<size_t>(len), '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), s.data(), len, nullptr, nullptr);
  return s;
}

std::string SanitizeFileName(std::string const &name) {
  std::string out = name;
  for (char &c : out) {
    bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '.' || c == '_' ||
        c == '-';
    if (!ok) {
      c = '_';
    }
  }
  if (out.empty()) {
    out = "package.msix";
  }
  return out;
}

std::string HresultHex(HRESULT hr) {
  char buf[16];
  snprintf(buf, sizeof(buf), "%08X", static_cast<unsigned>(hr));
  return std::string(buf);
}

} // namespace

void PackageInstallModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void PackageInstallModule::downloadFile(std::string url, std::string fileName,
                                        winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::thread([url = std::move(url), fileName = std::move(fileName),
               promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    try {
      auto localFolder = ApplicationData::Current().LocalFolder();
      std::string sanitized = SanitizeFileName(fileName);
      std::string leaf = std::to_string(GetTickCount64()) + "-" + sanitized;

      auto downloadsFolder = localFolder.CreateFolderAsync(L"mdm-downloads", CreationCollisionOption::OpenIfExists)
                                 .get();
      auto storageFile = downloadsFolder.CreateFileAsync(winrt::to_hstring(leaf), CreationCollisionOption::ReplaceExisting)
                             .get();
      auto fileStream = storageFile.OpenAsync(FileAccessMode::ReadWrite).get();

      HttpClient client;
      client.DefaultRequestHeaders().TryAppendWithoutValidation(L"User-Agent", L"FreeKiosk-MsixInstaller");

      int uriLen = MultiByteToWideChar(CP_UTF8, 0, url.c_str(), static_cast<int>(url.size()), nullptr, 0);
      std::wstring wideUrl(static_cast<size_t>(uriLen), L'\0');
      MultiByteToWideChar(CP_UTF8, 0, url.c_str(), static_cast<int>(url.size()), wideUrl.data(), uriLen);
      Uri uri{winrt::hstring(wideUrl)};

      auto response = client.GetAsync(uri, HttpCompletionOption::ResponseHeadersRead).get();
      auto statusCode = static_cast<int>(response.StatusCode());
      if (statusCode < 200 || statusCode >= 300) {
        promise.Reject(("Download failed: HTTP " + std::to_string(statusCode)).c_str());
        // Clean up the partial file.
        try {
          fileStream.Close();
          storageFile.DeleteAsync().get();
        } catch (...) {
        }
        return;
      }

      auto inputStream = response.Content().ReadAsInputStreamAsync().get();
      auto hashProvider = HashAlgorithmProvider::OpenAlgorithm(HashAlgorithmNames::Sha256());
      auto hash = hashProvider.CreateHash();

      uint64_t totalBytes = 0;
      IBuffer buffer = Buffer(64 * 1024);
      while (true) {
        buffer = inputStream.ReadAsync(buffer, buffer.Capacity(), InputStreamOptions::None).get();
        if (buffer.Length() == 0) {
          break;
        }
        hash.Append(buffer);
        fileStream.WriteAsync(buffer).get();
        totalBytes += buffer.Length();
      }
      fileStream.FlushAsync().get();
      fileStream.Close();

      auto digest = hash.GetValueAndReset();
      winrt::hstring hex = CryptographicBuffer::EncodeToHexString(digest);
      std::string sha = WideToUtf8(hex);
      std::transform(sha.begin(), sha.end(), sha.begin(), [](unsigned char c) { return std::tolower(c); });

      std::string path = WideToUtf8(storageFile.Path());
      std::string json = "{\"path\":\"" + JsonEscape(path) + "\"" +
          ",\"sizeBytes\":" + std::to_string(totalBytes) +
          ",\"sha256\":\"" + sha + "\"}";
      promise.Resolve(json);
    } catch (winrt::hresult_error const &e) {
      promise.Reject(("Download failed: " + WideToUtf8(e.message())).c_str());
    } catch (std::exception const &e) {
      promise.Reject((std::string("Download failed: ") + e.what()).c_str());
    } catch (...) {
      promise.Reject("Download failed");
    }
  }).detach();
}

void PackageInstallModule::installPackage(std::string path,
                                          winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::thread([path = std::move(path), promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    try {
      int wideLen = MultiByteToWideChar(CP_UTF8, 0, path.c_str(), static_cast<int>(path.size()), nullptr, 0);
      std::wstring widePath(static_cast<size_t>(wideLen), L'\0');
      MultiByteToWideChar(CP_UTF8, 0, path.c_str(), static_cast<int>(path.size()), widePath.data(), wideLen);
      std::replace(widePath.begin(), widePath.end(), L'\\', L'/');
      // Strip a leading '/' so file:/// + C:/... doesn't become four slashes.
      std::wstring uriPath = L"file:///" + widePath;

      PackageManager manager;
      Uri uri{winrt::hstring(uriPath)};
      auto result = manager.AddPackageAsync(uri, nullptr, DeploymentOptions::ForceTargetApplicationShutdown).get();

      auto errorText = WideToUtf8(result.ErrorText());
      if (result.IsRegistered()) {
        promise.Resolve("{\"success\":true}");
      } else {
        HRESULT extended = result.ExtendedErrorCode();
        std::string json = "{\"success\":false,\"error\":\"" + JsonEscape(errorText) + " (0x" + HresultHex(extended) +
            ")\"}";
        promise.Resolve(json);
      }
    } catch (winrt::hresult_error const &e) {
      std::string json = "{\"success\":false,\"error\":\"" + JsonEscape(WideToUtf8(e.message())) + " (0x" +
          HresultHex(e.code()) + ")\"}";
      promise.Resolve(json);
    } catch (std::exception const &e) {
      std::string json = "{\"success\":false,\"error\":\"" + JsonEscape(e.what()) + "\"}";
      promise.Resolve(json);
    }
  }).detach();
}

void PackageInstallModule::removePackage(std::string name,
                                         winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::thread([name = std::move(name), promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    try {
      std::string selfName = WideToUtf8(Package::Current().Id().Name());
      if (name == selfName) {
        promise.Resolve("{\"status\":\"failed\",\"error\":\"Cannot uninstall the kiosk app\"}");
        return;
      }

      int wideLen = MultiByteToWideChar(CP_UTF8, 0, name.c_str(), static_cast<int>(name.size()), nullptr, 0);
      std::wstring wideName(static_cast<size_t>(wideLen), L'\0');
      MultiByteToWideChar(CP_UTF8, 0, name.c_str(), static_cast<int>(name.size()), wideName.data(), wideLen);

      PackageManager manager;
      std::vector<Package> matches;
      for (auto const &pkg : manager.FindPackagesForUser(L"")) {
        if (WideToUtf8(pkg.Id().Name()) == name) {
          matches.push_back(pkg);
        }
      }

      if (matches.empty()) {
        promise.Resolve("{\"status\":\"not_installed\"}");
        return;
      }

      for (auto const &pkg : matches) {
        auto result = manager.RemovePackageAsync(pkg.Id().FullName()).get();
        auto errText = WideToUtf8(result.ErrorText());
        if (!errText.empty()) {
          std::string json = "{\"status\":\"failed\",\"error\":\"" + JsonEscape(errText) + "\"}";
          promise.Resolve(json);
          return;
        }
      }
      promise.Resolve("{\"status\":\"uninstalled\"}");
    } catch (winrt::hresult_error const &e) {
      std::string json = "{\"status\":\"failed\",\"error\":\"" + JsonEscape(WideToUtf8(e.message())) + "\"}";
      promise.Resolve(json);
    } catch (std::exception const &e) {
      std::string json = "{\"status\":\"failed\",\"error\":\"" + JsonEscape(e.what()) + "\"}";
      promise.Resolve(json);
    }
  }).detach();
}
void PackageInstallModule::listPackages(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  std::thread([promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    try {
      PackageManager manager;
      std::string json = "[";
      bool first = true;
      std::set<std::string> seen;
      for (auto const &pkg : manager.FindPackagesForUser(L"")) {
        if (pkg.IsFramework() || pkg.IsResourcePackage() ||
            pkg.SignatureKind() == PackageSignatureKind::System) {
          continue;
        }
        auto id = pkg.Id();
        std::string name = WideToUtf8(id.Name());
        if (seen.count(name)) {
          continue;
        }
        seen.insert(name);

        auto v = id.Version();
        int64_t versionCode = static_cast<int64_t>(v.Major) * 1000000 + static_cast<int64_t>(v.Minor) * 1000 + v.Build;
        std::string versionName = std::to_string(v.Major) + "." + std::to_string(v.Minor) + "." +
            std::to_string(v.Build) + "." + std::to_string(v.Revision);

        if (!first) {
          json += ",";
        }
        first = false;
        json += "{\"packageName\":\"" + JsonEscape(name) + "\"" +
            ",\"versionCode\":" + std::to_string(versionCode) +
            ",\"versionName\":\"" + JsonEscape(versionName) + "\"}";
      }
      json += "]";
      promise.Resolve(json);
    } catch (winrt::hresult_error const &e) {
      promise.Reject(WideToUtf8(e.message()).c_str());
    } catch (std::exception const &e) {
      promise.Reject(e.what());
    } catch (...) {
      promise.Reject("Failed to list packages");
    }
  }).detach();
}

void PackageInstallModule::getSelfPackageName(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise) noexcept {
  try {
    promise.Resolve(WideToUtf8(Package::Current().Id().Name()));
  } catch (...) {
    promise.Resolve("FreeKiosk");
  }
}

} // namespace winrt::FreeKiosk::implementation
