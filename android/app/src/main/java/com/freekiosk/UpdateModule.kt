package com.freekiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class UpdateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UpdateModule"

    override fun getConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "ENABLE_SELF_UPDATE" to BuildConfig.ENABLE_SELF_UPDATE
        )
    }

    @ReactMethod
    fun getCurrentVersion(promise: Promise) {
        try {
            val packageInfo = reactApplicationContext.packageManager.getPackageInfo(
                reactApplicationContext.packageName,
                0
            )
            val versionName = packageInfo.versionName
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }

            val result = Arguments.createMap().apply {
                putString("versionName", versionName)
                putInt("versionCode", versionCode)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get current version: ${e.message}")
        }
    }

    @ReactMethod
    fun checkForUpdates(promise: Promise) {
        rejectMdmOnly(promise)
    }

    @ReactMethod
    fun checkForUpdatesWithChannel(includeBeta: Boolean, promise: Promise) {
        rejectMdmOnly(promise)
    }

    @ReactMethod
    fun downloadAndInstall(downloadUrl: String, version: String, promise: Promise) {
        rejectMdmOnly(promise)
    }

    private fun rejectMdmOnly(promise: Promise) {
        if (!BuildConfig.ENABLE_SELF_UPDATE) {
            promise.reject("DISABLED", "Self-update is disabled in Play Store builds")
            return
        }
        promise.reject(
            "USE_MDM",
            "Updates are delivered through TransKIOSK MDM. Enroll the device agent and use Settings → Advanced → Updates."
        )
    }

    @ReactMethod
    fun checkInstallPermission(promise: Promise) {
        if (!BuildConfig.ENABLE_SELF_UPDATE) {
            promise.reject("DISABLED", "Self-update is disabled in Play Store builds")
            return
        }
        try {
            val canInstall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.packageManager.canRequestPackageInstalls()
            } else {
                true
            }
            promise.resolve(canInstall)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check install permission: ${e.message}")
        }
    }

    @ReactMethod
    fun openInstallPermissionSettings(promise: Promise) {
        if (!BuildConfig.ENABLE_SELF_UPDATE) {
            promise.reject("DISABLED", "Self-update is disabled in Play Store builds")
            return
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${reactApplicationContext.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                val intent = Intent(Settings.ACTION_SECURITY_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject(
                "SETTINGS_UNAVAILABLE",
                "Cannot open install permission settings. Use adb install -r <apk> instead."
            )
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}

/** Legacy receiver kept for manifest compatibility; kiosk self-update uses ApkInstallReceiver. */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val status = intent?.getIntExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, -1)
        if (status == android.content.pm.PackageInstaller.STATUS_SUCCESS && context != null) {
            KioskSelfUpdate.restartApp(context)
        }
    }
}
