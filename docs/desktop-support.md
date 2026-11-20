
# FreeKiosk Desktop Support (Windows / macOS)

**Feasibility assessment and porting roadmap**

<p>
  <a href="README.md">Docs Home</a> •
  <a href="features-and-modes.md">Features & Modes</a> •
  <a href="development.md">Development</a>
</p>

## TL;DR

- It is possible, but it is a port. All device control (about 23.5k lines of Kotlin) must be rewritten per OS in C++/C# (Windows) or Swift/Obj-C (macOS).
- The TypeScript UI and logic is mostly reusable through react-native-windows and react-native-macos.
- Windows is the realistic first target. react-native-windows supports RN 0.82, and Shell Launcher gives true kiosk lockdown, but only on Enterprise, Education and IoT editions.
- macOS is weaker: react-native-macos has no 0.82 release, and macOS has no OS kiosk mode, so lockdown is app-level and best effort.

## What exists today

- **Native layer:** 90 Kotlin files, 23,573 lines, under `android/app/src/main/java/com/freekiosk/` (including `api/`, `mqtt/`, `mdm/`). All of it is Android-only.
- **TypeScript layer:** `src/` holds 32,494 lines of TS/TSX. 34 files reference `NativeModules`. Only a few files guard with `Platform.OS`, for example `src/utils/HttpServerModule.ts` (returns early when not `'android'`) and `src/utils/secureStorage.ts`.
- **`ios/`** is the stock React Native template (`AppDelegate.swift`, `Podfile`) and has no native modules.
- **React Native version:** `react-native` is `0.82.0`.

The REST API (NanoHTTPD), MQTT (HiveMQ client) and MDM agent are all implemented in Kotlin, not JS, so they do not come for free on desktop.

## Native module mapping

Effort legend:

- **S** = under ~200 lines of native code, a public API exists.
- **M** = ~200–800 lines or several APIs.
- **L** = over ~800 lines, or needs OS policy or privileged design.
- **N/A** = no desktop equivalent, so the feature is hidden on that OS.

| JS module (Kotlin file) | Purpose | Windows equivalent | macOS equivalent | Effort Win / Mac |
|---|---|---|---|---|
| `KioskModule` (`KioskModule.kt`, 41 methods) | Lock task, screen on/off, reboot, auto-launch, Device Owner | Shell Launcher / Assigned Access set by an admin; app full-screen via the WinAppSDK `AppWindow` FullScreen presenter; screen off via `SC_MONITORPOWER`; reboot via `ExitWindowsEx` (needs privilege); auto-launch via Shell Launcher or a startup task | `NSApplication.PresentationOptions`; `pmset displaysleepnow`; LaunchAgent / `SMAppService` login item; reboot needs admin. Device Owner, factory-reset block, Safety Hub and usage-stats are N/A on both | L / L |
| `AppLauncherModule` | Launch and monitor an external app | `CreateProcess` / `ShellExecuteEx` plus process-handle wait | `NSWorkspace.openApplication` plus `NSWorkspace.didTerminateApplicationNotification` | M / M |
| `BlockingOverlayModule` + `OverlayServiceModule` + `OverlayPermissionModule` (with `OverlayService.kt`) | Overlays and floating buttons over other apps | Borderless `WS_EX_TOPMOST \| WS_EX_LAYERED` windows | Borderless `NSWindow` at `.screenSaver` level. The overlay permission is N/A on both | L / L |
| `AccessibilityModule` + `AccessibilityServiceModule` (with `FreeKioskAccessibilityService.kt`) | Back/gesture suppression and key injection | `WH_KEYBOARD_LL` hook and `SendInput`; cannot block Ctrl+Alt+Del, so rely on Shell Launcher / Group Policy | `CGEventTap`, needs the Accessibility (TCC) permission; Cmd+Opt+Esc is covered by `disableForceQuit` | L / L |
| `ApkInstallModule` + `UpdateModule` | APK install and self-update | MSIX plus App Installer (`.appinstaller` auto-update) | Signed and notarized `.dmg`/`.pkg` plus Sparkle. APK install is N/A | M / M |
| `AudioControlModule` | Volume and output device | Core Audio `IAudioEndpointVolume` / `IMMDeviceEnumerator` | CoreAudio `AudioObjectSetPropertyData` | M / M |
| `AutoBrightnessModule` + `react-native-brightness-newarch` | Brightness | WMI `WmiMonitorBrightnessMethods` (built-in panels only; external monitors need DDC/CI) | No public API for external displays; built-in panels only via private frameworks | M / L (partial) |
| `BluetoothControlModule` | Bluetooth control | `Windows.Devices.Radios` | `IOBluetooth` (toggling power requires private API) | M / L (partial) |
| `WifiControlModule` | Wi-Fi control | Native Wifi API (`WlanConnect`) | CoreWLAN (reading the SSID needs Location permission) | M / M |
| `CameraPhotoModule` + `MotionDetectionModule` + `react-native-vision-camera` | Camera capture, motion detection, QR enrollment | `Windows.Media.Capture.MediaCapture` | AVFoundation | L / L |
| `CertificateModule` | Accepted SSL certificates for the WebView | WebView2 `ServerCertificateErrorDetected` | `WKNavigationDelegate` authentication challenge | S / S |
| `FilePickerModule` | File picker | `IFileOpenDialog` | `NSOpenPanel` | S / S |
| `FlashlightModule` | Flashlight | N/A | N/A | N/A / N/A |
| `LauncherModule` | Set as home launcher | Shell Launcher (admin config, not app code) | N/A | S / N/A |
| `PrintModule` | Print page | WebView2 `PrintAsync` | `WKWebView.printOperation` | S / S |
| `RotationControlModule` | Screen rotation | `ChangeDisplaySettingsEx` with `DMDO_*` orientation | No public API | S / N/A |
| `ScreenCaptureModule` | Screenshots | `Windows.Graphics.Capture` | ScreenCaptureKit (needs the Screen Recording TCC permission) | M / M |
| `SystemInfoModule` | Battery, memory, storage | `GetSystemPowerStatus`, `GlobalMemoryStatusEx`, `GetDiskFreeSpaceEx` | IOKit power sources, `host_statistics64`, `URLResourceValues` | S / S |
| `HttpServerModule` (`api/HttpServerModule.kt` 2,264 lines + `api/KioskHttpServer.kt` 836 lines, 17 methods) | REST API | Embedded C++ server (e.g. cpp-httplib) plus a Windows Firewall rule at install time | Network.framework `NWListener`, plus the Local Network privacy prompt | L / L |
| `MqttModule` (`mqtt/`, 3 files, about 1.9k lines) | MQTT plus Home Assistant discovery | Eclipse Paho C/C++ | CocoaMQTT | L / L |
| `MdmAgentModule` (`mdm/`, 11 files) | MDM agent | HTTP client logic ports as is; logcat reader is N/A (replace with app log files) | Same as Windows | M / M |
| Background components: `KioskWatchdogService`, `BackgroundAppMonitorService`, `BootReceiver`, `ScreenSchedulerReceiver`, `ScreenStateReceiver`, `VolumeChangeReceiver`, `BootLockActivity`, `HomeActivity` | Keep-alive, boot start, screen schedule | Shell Launcher restart-on-exit plus Task Scheduler | launchd LaunchAgent with `KeepAlive`, `RunAtLoad` and `StartCalendarInterval` | M / M |

## JavaScript dependency support

Source: [React Native Directory](https://reactnative.directory), queried 2026-11-20. Packages with no directory entry were checked against their npm README.

| Package | Windows | macOS | Notes |
|---|---|---|---|
| `react-native-webview` | ✅ | ✅ | Backed by WebView2 on Windows and WKWebView on macOS. The 4 behaviors in `patches/react-native-webview+13.16.0.patch` (camera/mic auto-grant, SSL same-host handling, PDF `DownloadListener`, User-Agent guard) are Android-only and must be re-implemented. |
| `@react-native-async-storage/async-storage` | ✅ | ✅ | |
| `@react-native-picker/picker` | ✅ | ✅ | |
| `react-native-gesture-handler` | ❌ | ✅ | |
| `react-native-keychain` | ❌ | ❌ | `secureStorage.ts` needs a desktop backend (Windows: Credential Manager `CredWrite`; macOS: Keychain Services). |
| `react-native-vision-camera` | ❌ | ❌ | |
| `react-native-fs` | ❌ | ❌ | Marked unmaintained. |
| `@react-native-cookies/cookies` | ❌ | ❌ | Marked unmaintained. |
| `react-native-screens`, `react-native-safe-area-context` | ❌ | ❌ | Remove the dependency, or use `@react-navigation/stack` (JS-based, already in `package.json`) on desktop. |
| `react-native-paper` | JS | JS | Pure JS, so usable once its peers (vector icons, safe-area) resolve. |
| `@react-native-community/slider` | ✅ | ❌ | No directory entry; README lists iOS, Android, Windows and Web. |
| `react-native-vector-icons` | ✅ | ✅ | No directory entry; README has Windows and macOS (`react-native-macos`) setup sections. |
| `react-native-brightness-newarch` | ❌ | ❌ | No directory entry; README does not mention Windows or macOS. |

## Kiosk lockdown per OS

| Capability | Android (today) | Windows | macOS |
|---|---|---|---|
| Single-app lock | Lock task mode via Device Owner | Assigned Access single-app runs only a UWP app or Microsoft Edge, so an RNW (WinAppSDK desktop) app cannot use it. Shell Launcher v2 replaces `Explorer.exe` with any desktop app. | No OS single-app mode. App-level `PresentationOptions` plus full-screen window. |
| Block home / app switch | Lock task, accessibility service | Shell Launcher removes the shell; `WH_KEYBOARD_LL` hook for extra keys | `hideDock`, `disableProcessSwitching`, `disableHideApplication` |
| Block power / force-quit | Lock task, accessibility service | Group Policy; Ctrl+Alt+Del cannot be hooked | `disableForceQuit`, `disableSessionTermination` |
| Auto-start at boot | `BootReceiver` | Shell Launcher or Task Scheduler / startup task | launchd LaunchAgent (`RunAtLoad`) or `SMAppService` login item |
| Relaunch on crash | `KioskWatchdogService` | Shell Launcher restarts the shell app on exit | launchd `KeepAlive` |
| Required OS edition or permission | Device Owner provisioning (ADB / QR) | Shell Launcher: Enterprise / Enterprise LTSC, Education, IoT Enterprise (not Pro). Assigned Access: Pro, Enterprise, Education, IoT Enterprise. | Accessibility (TCC) for event taps; admin for reboot. `disableForceQuit`, `disableProcessSwitching`, `disableSessionTermination` and `disableMenuBarTransparency` must be combined with `hideDock` or `autoHideDock`, and `hideMenuBar` requires `hideDock`; otherwise AppKit raises an exception. |

- **Windows Pro:** the only options are a multi-app Assigned Access *restricted user experience* (Taskbar and Start stay visible) or app-level full screen. True single-app lockdown needs Enterprise, Education or IoT Enterprise with Shell Launcher.
- **macOS:** every protection is app-level, and a user with admin rights can bypass it.

## Feature availability on desktop

| Feature | Windows | macOS |
|---|---|---|
| WebView mode | Portable | Portable |
| Media Player | Portable | Portable |
| Dashboard (URL tiles) | Portable | Portable |
| PIN screen | Portable | Portable |
| Settings UI | Portable | Portable |
| Planner / Screen scheduler UI logic | Portable | Portable |
| External App mode | Needs native port | Needs native port |
| REST API | Needs native port | Needs native port |
| MQTT / Home Assistant | Needs native port | Needs native port |
| Motion detection | Needs native port | Needs native port |
| Blocking overlays | Needs native port | Needs native port |
| Wi-Fi / Bluetooth / audio / brightness dialogs | Needs native port | Needs native port |
| Self-update | Needs native port | Needs native port |
| MDM | Needs native port | Needs native port |
| Device Owner | Not possible | Not possible |
| ADB provisioning | Not possible | Not possible |
| APK install | Not possible | Not possible |
| Flashlight | Not possible | Not possible |
| Android accessibility-service features | Not possible | Not possible |
| Screen rotation | Needs native port | Not possible |

`MediaPlayerComponent.tsx` renders through `react-native-webview` and `DashboardGrid.tsx` is pure React Native, which is why those modes are portable.

## Recommended path

1. **Windows MVP** with react-native-windows `0.82.x` (matches the current RN version):
   - add a `windows/` project;
   - add `Platform.OS === 'windows'` guards so the 34 `NativeModules` call sites no-op;
   - ship WebView, Media and Dashboard modes, PIN and Settings;
   - document Shell Launcher / Assigned Access setup.
2. **Windows parity:** native modules in priority order: REST API → MQTT → SystemInfo / Audio / ScreenCapture → External App launcher → overlays.
3. **macOS:** start only once react-native-macos ships a release matching the repo's RN version (today 0.83.0 vs repo 0.82.0; no 0.82.x exists). Use the same module order, plus a `PresentationOptions` kiosk and a LaunchAgent.

**Alternative:** an Electron/Tauri desktop app gets Windows and macOS from one codebase for web-kiosk mode. It reuses only the non-UI TS (storage and config logic), not the RN components, and REST/MQTT would run in Node (no native port). It forks the UI, so it is not recommended unless desktop is web-kiosk-only.

## Sources

- [Assigned Access (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/)
- [Shell Launcher (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/configuration/shell-launcher/)
- [NSApplication.PresentationOptions (Apple)](https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct)
- [react-native-windows (npm)](https://www.npmjs.com/package/react-native-windows)
- [react-native-macos (npm)](https://www.npmjs.com/package/react-native-macos)
- [React Native Directory](https://reactnative.directory)
