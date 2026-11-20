# FreeKiosk on Windows

FreeKiosk supports Windows via [react-native-windows](https://microsoft.github.io/react-native-windows/). This document covers what's supported, how to build, and the architecture.

## Requirements

- **Windows 10 1809+** or **Windows 11**
- **Node.js 20+**
- **Visual Studio 2022** with "Desktop development with C++" workload
- **Windows SDK 10.0.19041+**

## Quick Start

```bash
# Install dependencies
npm install

# Build and run (Debug)
cd windows
start ..\node_modules\react-native-windows\local-cli\run-windows\run-windows.js
```

Or build manually:

```bash
cd windows
msbuild FreeKiosk.sln /p:Configuration=Debug /p:Platform=x64
.\x64\Debug\FreeKiosk.exe
```

## What's Supported

### Core Features

| Feature | Status | Notes |
|---------|--------|-------|
| WebView kiosk | ✅ | Via `react-native-webview-windows` (WebView2) |
| Dashboard | ✅ | Fully functional |
| External app launcher | ✅ | Via `ShellExecute` |
| Media player | ✅ | Video/image playback |
| REST API | ✅ | Pure TS implementation |
| MQTT/Home Assistant | ✅ | Pure TS implementation |
| Device Owner | ❌ | Windows doesn't have Android Device Owner |
| Kiosk mode | ⚠️ | Via Windows Assigned Access or TransactedKiosk |

### REST API

All REST API endpoints are implemented in pure TypeScript:

- `src/platform/windows/rest/httpParser.ts` — HTTP/1.1 parser
- `src/platform/windows/rest/httpServer.ts` — TCP-based HTTP server
- `src/platform/windows/rest/restApi.ts` — Route handlers
- `src/platform/windows/rest/WindowsRestServer.ts` — Singleton

The API listens on port 8080 by default. Configure via `ApiSettingsSection`.

### MQTT

Full MQTT 3.1.1 implementation in TypeScript:

- `src/platform/windows/mqtt/packets.ts` — Packet encode/decode
- `src/platform/windows/mqtt/client.ts` — Client with auto-reconnect
- `src/platform/windows/mqtt/discovery.ts` — HA discovery entities
- `src/platform/windows/mqtt/commandMap.ts` — Command routing

Configure via `MqttSettingsSection`.

### Native Modules

C++ modules in `windows/FreeKiosk/modules/`:

| Module | Purpose |
|--------|---------|
| `TcpSocketModule` | Winsock2 TCP server/client for HTTP/MQTT |
| `KioskModule` | Screen, volume, input, file, clipboard, process |
| `AppLauncherModule` | App lifecycle, running apps |
| `SystemInfoModule` | Device, battery, storage, network info |
| `AudioControlModule` | Volume/mute via waveOut |
| `ScreenshotModule` | Screen capture (stub) |
| `InputInjectionModule` | SendInput key/mouse/text |
| `KeychainModule` | In-memory credential store |
| `FilePickerModule` | File dialogs (stub) |
| `BlockingOverlayModule` | Overlay management |
| `OverlayServiceModule` | Overlay service (stub) |
| `HttpServerModule` | HTTP server stub (TS layer handles) |
| `Win32UtilModule` | Win32 API helpers |

## Architecture

### Platform Detection

```typescript
import { Platform } from 'react-native';
const isWindows = Platform.OS === 'windows';
```

Or use the helper:

```typescript
import { IS_WINDOWS } from './platform/windows/isWindows';
```

### File Resolution

Metro resolves platform-specific files:

- `Module.windows.ts` → Windows
- `Module.android.ts` → Android
- `Module.ts` → Default

Shims for unsupported packages are in `src/platform/windows/shims/`.

### Dependency Overrides

`react-native.config.js` disables autolinking for packages without Windows support:

```javascript
module.exports = {
  dependencies: {
    'react-native-paper': { platforms: { windows: null } },
    // ... 10 more packages
  },
};
```

`metro.config.js` maps unsupported imports to shims:

```javascript
const WINDOWS_SHIMS = {
  'react-native-safe-area-context': './src/platform/windows/shims/safeAreaContext.tsx',
  // ... 6 more
};
```

## Building for Release

```bash
cd windows
msbuild FreeKiosk.sln /p:Configuration=Release /p:Platform=x64
```

Output: `windows\x64\Release\FreeKiosk.exe`

## Kiosk Mode

Windows kiosk mode is achieved via:

1. **Assigned Access** (Windows 10/11 Pro/Enterprise) — Lock user to specific app
2. **TransactedKiosk** (Windows 10/11 Enterprise) — Lightweight kiosk
3. **Shell Launcher** — Replace Explorer with FreeKiosk

For development, run without kiosk mode. For production, configure via Windows provisioning.

## Limitations

- **No Device Owner** — Android-specific feature
- **No ADB provisioning** — Use Windows provisioning instead
- **No accessibility service** — Use Windows UI Automation
- **Limited brightness control** — Depends on display driver
- **No Android intents** — Use `ShellExecute` for app launching

## Troubleshooting

### Build fails with C++ errors

Ensure Visual Studio 2022 is installed with C++ workload:

```bash
# Check installation
& "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
```

### Module not found

Check that the module is registered in `FreeKiosk.cpp` and included in `FreeKiosk.vcxproj`.

### HTTP server not starting

Verify `TcpSocketModule` is working:

```typescript
import { NativeModules } from 'react-native';
const { TcpSocketModule } = NativeModules;
const serverId = await TcpSocketModule.createServer(8080);
```

## CI

GitHub Actions workflow: `.github/workflows/windows-build.yml`

Runs on `windows-2022` runner:
1. `npm ci`
2. `npm run bundle:windows`
3. `cd windows && msbuild FreeKiosk.sln /p:Configuration=Release /p:Platform=x64`
4. `scripts/windows-smoke.ps1`

## Related

- [Android build](../android/README.md)
- [REST API docs](rest-api.md)
- [MQTT docs](MQTT.md)
- [Desktop support matrix](desktop-support.md)
