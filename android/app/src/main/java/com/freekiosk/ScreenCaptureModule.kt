package com.freekiosk

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "ScreenCaptureModule"
        private const val TAG = "ScreenCaptureModule"
        const val REQUEST_MEDIA_PROJECTION = 9101

        @Volatile
        var restorePromptedThisProcess = false

        fun tryRestoreRemoteCaptureIfNeeded(activity: Activity) {
            if (restorePromptedThisProcess) {
                return
            }
            val appContext = activity.applicationContext
            if (ScreenCaptureManager.isDeviceOwnerCaptureAvailable(appContext)) {
                return
            }
            if (!ScreenCaptureManager.isRemoteCaptureWanted(appContext)) {
                return
            }
            if (ScreenCaptureManager.isActive()) {
                return
            }

            restorePromptedThisProcess = true
            activity.runOnUiThread {
                try {
                    val projectionManager = appContext.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
                        as MediaProjectionManager
                    activity.startActivityForResult(
                        projectionManager.createScreenCaptureIntent(),
                        REQUEST_MEDIA_PROJECTION
                    )
                    Log.d(TAG, "Auto-restoring MediaProjection after reboot")
                } catch (e: Exception) {
                    restorePromptedThisProcess = false
                    Log.w(TAG, "Failed to auto-restore screen capture: ${e.message}")
                }
            }
        }
    }

    private var pendingPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isScreenCaptureActive(promise: Promise) {
        promise.resolve(ScreenCaptureManager.isCaptureReady(reactContext))
    }

    @ReactMethod
    fun isRemoteCaptureWanted(promise: Promise) {
        promise.resolve(ScreenCaptureManager.isRemoteCaptureWanted(reactContext))
    }

    @ReactMethod
    fun setRemoteCaptureWanted(wanted: Boolean, promise: Promise) {
        try {
            ScreenCaptureManager.setRemoteCaptureWanted(reactContext, wanted)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_WANTED_FAILED", "Failed to save remote capture preference: ${e.message}")
        }
    }

    @ReactMethod
    fun requestScreenCapturePermission(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        if (pendingPromise != null) {
            promise.reject("REQUEST_IN_PROGRESS", "Screen capture permission request already in progress")
            return
        }

        pendingPromise = promise

        try {
            val projectionManager = reactContext.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
                as MediaProjectionManager
            activity.startActivityForResult(
                projectionManager.createScreenCaptureIntent(),
                REQUEST_MEDIA_PROJECTION
            )
        } catch (e: Exception) {
            pendingPromise = null
            promise.reject("REQUEST_FAILED", "Failed to request screen capture permission: ${e.message}")
        }
    }

    @ReactMethod
    fun stopScreenCapture(promise: Promise) {
        try {
            ScreenCaptureService.stop(reactContext)
            ScreenCaptureManager.stopProjection(reactContext, userInitiated = true)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", "Failed to stop screen capture: ${e.message}")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_MEDIA_PROJECTION) {
            return
        }

        val promise = pendingPromise
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            if (promise != null) {
                promise.reject("PERMISSION_DENIED", "Screen capture permission was denied")
            } else {
                Log.w(TAG, "Auto-restore screen capture permission was denied")
            }
            return
        }

        try {
            val projectionData = Intent(data)
            ScreenCaptureService.start(reactContext, resultCode, projectionData)
            promise?.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start screen capture service: ${e.message}", e)
            promise?.reject("START_FAILED", "Failed to start screen capture: ${e.message}")
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }
}
