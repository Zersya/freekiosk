# Fleet Tablet Setup (ADB)

See also the MDM repo cheatsheet: [freekiosk-mdm/docs/TABLET_SETUP.md](https://github.com/Zersya/freekiosk-mdm/blob/main/docs/TABLET_SETUP.md) (after publish).

Quick reference for this fork (`com.freekiosk`).

## Device Owner

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```

Remove via app (**Settings → Advanced → Remove Device Owner**) before `adb uninstall com.freekiosk`.

## Permissions

```bash
adb shell pm grant com.freekiosk android.permission.WRITE_SECURE_SETTINGS
```

Enable **Accessibility Service** in app for Remote Assist tap/swipe.

## Remote Assist prerequisites

- REST API ON + Allow Remote Control
- Remote Screenshot ON (MediaProjection consent)
- Accessibility Service ON

## API endpoints (this branch)

- `GET /api/screenshot/stream` — MJPEG live view
- `POST /api/remote/tap` — `{"x", "y"}`
- `POST /api/remote/swipe` — `{"x1", "y1", "x2", "y2", "duration"?}`
