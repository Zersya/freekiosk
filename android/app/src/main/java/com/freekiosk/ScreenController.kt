package com.freekiosk

import android.accessibilityservice.AccessibilityService
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil

object ScreenController {

    private const val TAG = "ScreenController"
    const val EXTRA_WAKE_SCREEN = "com.freekiosk.WAKE_SCREEN"
    private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L
    private var wakeLock: PowerManager.WakeLock? = null

    fun turnScreenOn(reactContext: ReactApplicationContext) {
        acquireWakeLock(reactContext.applicationContext)

        UiThreadUtil.runOnUiThread {
            try {
                val activity = reactContext.currentActivity
                if (activity != null) {
                    applyWakeFlagsToActivity(activity, reactContext, remoteWake = true)
                    Log.d(TAG, "Screen turned ON (activity available)")
                } else {
                    Log.d(TAG, "No activity — launching MainActivity to wake screen")
                }

                // Always bring MainActivity forward so setTurnScreenOn() runs on resume.
                // WakeLock alone is unreliable after a system screen timeout on modern Android.
                bringMainActivityToForeground(reactContext.applicationContext)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen on: ${e.message}")
            }
        }
    }

    fun applyWakeFlagsToActivity(activity: Activity, context: Context, remoteWake: Boolean = false) {
        try {
            val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
            val keepScreenOn = prefs.getBoolean("keep_screen_on", true)

            if (keepScreenOn || remoteWake) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }

            val layoutParams = activity.window.attributes
            layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            activity.window.attributes = layoutParams

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(true)
                activity.setTurnScreenOn(true)
                val keyguardManager =
                    context.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                keyguardManager.requestDismissKeyguard(activity, null)
            } else {
                @Suppress("DEPRECATION")
                activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply wake flags: ${e.message}")
        }
    }

    fun handleWakeScreenIntent(activity: Activity) {
        applyWakeFlagsToActivity(activity, activity.applicationContext, remoteWake = true)
        Log.d(TAG, "Screen wake flags applied from activity intent")
    }

    private fun acquireWakeLock(context: Context) {
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock?.release()
            @Suppress("DEPRECATION")
            wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                "FreeKiosk:ScreenOn"
            )
            wakeLock?.acquire(WAKE_LOCK_TIMEOUT_MS)
            Log.d(TAG, "WakeLock acquired to turn screen ON")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire WakeLock: ${e.message}")
        }
    }

    private fun bringMainActivityToForeground(context: Context) {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
                putExtra(EXTRA_WAKE_SCREEN, true)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bring MainActivity to foreground: ${e.message}")
        }
    }

    fun turnScreenOff(reactContext: ReactApplicationContext) {
        UiThreadUtil.runOnUiThread {
            try {
                wakeLock?.release()
                wakeLock = null

                val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                val adminComp = ComponentName(reactContext, DeviceAdminReceiver::class.java)

                if (dpm.isDeviceOwnerApp(reactContext.packageName) || dpm.isAdminActive(adminComp)) {
                    dpm.lockNow()
                    val method = if (dpm.isDeviceOwnerApp(reactContext.packageName)) "Device Owner" else "Device Admin"
                    Log.d(TAG, "Screen turned OFF via $method lockNow()")
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && FreeKioskAccessibilityService.isRunning()) {
                    val ok = FreeKioskAccessibilityService.performAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
                    if (ok) {
                        Log.d(TAG, "Screen locked via AccessibilityService")
                    } else {
                        dimScreen(reactContext)
                    }
                } else {
                    dimScreen(reactContext)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to turn screen off: ${e.message}")
            }
        }
    }

    private fun dimScreen(reactContext: ReactApplicationContext) {
        val activity = reactContext.currentActivity ?: return
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val layoutParams = activity.window.attributes
        layoutParams.screenBrightness = 0f
        activity.window.attributes = layoutParams
        Log.d(TAG, "Screen dimmed to 0 (no DO, no AccessibilityService)")
    }
}
