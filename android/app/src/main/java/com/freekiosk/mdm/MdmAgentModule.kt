package com.freekiosk.mdm

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class MdmAgentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "MdmAgentModule"
        private const val NAME = "MdmAgentModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun configure(wsUrl: String, enrollmentToken: String?, promise: Promise) {
        try {
            val trimmedUrl = wsUrl.trim()
            if (trimmedUrl.isBlank()) {
                promise.reject("INVALID_URL", "WebSocket URL is required")
                return
            }
            MdmAgentPrefs.setWsUrl(reactContext, trimmedUrl)
            if (!enrollmentToken.isNullOrBlank()) {
                MdmAgentPrefs.setEnrollmentToken(reactContext, enrollmentToken.trim())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CONFIGURE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startAgent(promise: Promise) {
        try {
            if (MdmAgentPrefs.getWsUrl(reactContext).isNullOrBlank()) {
                promise.reject("NOT_CONFIGURED", "Configure MDM WebSocket URL first")
                return
            }
            MdmAgentPrefs.setEnabled(reactContext, true)
            MdmAgentService.start(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "startAgent failed", e)
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopAgent(promise: Promise) {
        try {
            MdmAgentPrefs.setEnabled(reactContext, false)
            MdmAgentService.stop(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isAgentConnected(promise: Promise) {
        promise.resolve(MdmAgentService.isConnected())
    }

    @ReactMethod
    fun getAgentInfo(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("enabled", MdmAgentPrefs.isEnabled(reactContext))
            putBoolean("connected", MdmAgentService.isConnected())
            putString("wsUrl", MdmAgentPrefs.getWsUrl(reactContext))
            putInt("deviceId", MdmAgentPrefs.getDeviceId(reactContext))
            putBoolean("enrolled", MdmAgentPrefs.getDeviceId(reactContext) > 0 && !MdmAgentPrefs.getAgentToken(reactContext).isNullOrBlank())
        }
        promise.resolve(map)
    }

    private fun sendEvent(event: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }
}
