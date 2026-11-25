// FreeKiosk.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "FreeKiosk.h"

#include "AutolinkedNativeModules.g.h"
#include "NativeModules.h"
#include "modules/TcpSocketModule.h"
#include "modules/KioskModule.h"
#include "modules/AppLauncherModule.h"
#include "modules/SystemInfoModule.h"
#include "modules/AudioControlModule.h"
#include "modules/ScreenshotModule.h"
#include "modules/InputInjectionModule.h"
#include "modules/KeychainModule.h"
#include "modules/FilePickerModule.h"
#include "modules/BlockingOverlayModule.h"
#include "modules/OverlayServiceModule.h"
#include "modules/HttpServerModule.h"
#include "modules/Win32Util.h"
#include "modules/Base64.h"
#include <fstream>
#include <filesystem>
#include "modules/ScreenCapture.h"
#include "modules/PackageInstallModule.h"

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);


  // TEMP diagnostic: prove WinMain ran / stage markers
  auto mark = [](const char *stage) {
    try {
      std::ofstream f(std::filesystem::path(
          winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path().c_str()) / "freekiosk_winmain.log",
          std::ios::app);
      f << stage << std::endl;
    } catch (...) {
    }
  };
  mark("WinMain entered");

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};
  mark("host built");

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());
  mark("providers appended");

  settings.InstanceCreated([mark](auto &&, auto &&) { mark("InstanceCreated"); });
  settings.InstanceLoaded([mark](auto &&, auto &&args) {
    mark(args.Failed() ? "InstanceLoaded FAILED" : "InstanceLoaded OK");
  });

  settings.NativeLogger(
      winrt::Microsoft::ReactNative::LogHandler{
          [mark](winrt::Microsoft::ReactNative::LogLevel level, winrt::hstring const &message) {
            std::wstring ws(message.c_str());
            std::string utf8(ws.begin(), ws.end());
            std::string line = "JS[" + std::to_string(static_cast<int>(level)) + "] " + utf8;
            mark(line.c_str());
          }});

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  mark("AppWindow got");
  appWindow.Title(L"FreeKiosk");
  appWindow.Resize({1000, 1000});
  mark("AppWindow resized");

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"FreeKiosk");
  mark("view options set, calling Start()");

  // TEMP diagnostic: start the JS instance before Start(), in case
  // AppWindow.Show() blocks on a non-interactive session.
  reactNativeWin32App.ReactNativeHost().InstanceSettings().Properties().Set(
      winrt::Microsoft::ReactNative::ReactDispatcherHelper::UIDispatcherProperty(),
      winrt::Microsoft::ReactNative::ReactDispatcherHelper::UIThreadDispatcher());
  reactNativeWin32App.ReactNativeHost().ReloadInstance();
  mark("ReloadInstance() returned");

  reactNativeWin32App.AppWindow().Show();
  mark("AppWindow.Show() returned");

  // Start the app
  reactNativeWin32App.Start();

  {
    std::ofstream doneFile(std::filesystem::path(
        winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path().c_str()) / "freekiosk_started.log",
        std::ios::app);
    doneFile << "Start() returned" << std::endl;
  }
}
