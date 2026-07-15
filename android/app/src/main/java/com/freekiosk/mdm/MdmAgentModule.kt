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

    override fun initialize() {
        super.initialize()
        MdmBackupCommandBridge.attach(reactContext)
    }

    override fun invalidate() {
        MdmBackupCommandBridge.detach()
        super.invalidate()
    }

    @ReactMethod
    fun resolveMdmConfigCommand(
        requestId: String,
        success: Boolean,
        dataJson: String?,
        error: String?,
        promise: Promise,
    ) {
        try {
            val data = if (dataJson.isNullOrBlank()) null else org.json.JSONObject(dataJson)
            MdmBackupCommandBridge.resolve(requestId, success, data, error)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESOLVE_MDM_CONFIG_ERROR", e.message, e)
        }
    }

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
            putString("deviceId", MdmAgentPrefs.getDeviceId(reactContext))
            putBoolean("enrolled", MdmAgentPrefs.isEnrolled(reactContext))
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun clearEnrollment(promise: Promise) {
        try {
            MdmAgentPrefs.setEnabled(reactContext, false)
            MdmAgentService.stop(reactContext)
            MdmAgentPrefs.clearCredentials(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "clearEnrollment failed", e)
            promise.reject("CLEAR_ENROLLMENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun fetchAvailableApps(promise: Promise) {
        Thread {
            try {
                val result = MdmAppsClient.fetchAvailableApps(reactContext)
                val apps = result.optJSONArray("apps") ?: org.json.JSONArray()
                val array = Arguments.createArray()
                for (i in 0 until apps.length()) {
                    val app = apps.getJSONObject(i)
                    array.pushMap(Arguments.createMap().apply {
                        putInt("id", app.optInt("id"))
                        putString("name", app.optString("name"))
                        putString("packageName", app.optString("packageName"))
                        putString("versionName", app.optString("versionName", null))
                        putInt("versionCode", app.optInt("versionCode"))
                        putString("fileName", app.optString("fileName"))
                        putDouble("fileSizeBytes", app.optLong("fileSizeBytes").toDouble())
                        putString("sha256", app.optString("sha256"))
                        putString("downloadUrl", app.optString("downloadUrl"))
                        if (!app.isNull("installStatus")) {
                            putString("installStatus", app.optString("installStatus"))
                        }
                        putBoolean("installedOnDevice", app.optBoolean("installedOnDevice", false))
                        if (!app.isNull("deviceVersionName")) {
                            putString("deviceVersionName", app.optString("deviceVersionName"))
                        }
                        putBoolean("updateAvailable", app.optBoolean("updateAvailable", false))
                    })
                }
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("FETCH_APPS_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun fetchKioskUpdate(promise: Promise) {
        Thread {
            try {
                val result = MdmKioskUpdateClient.fetchKioskUpdate(reactContext)
                promise.resolve(kioskUpdateToMap(result))
            } catch (e: Exception) {
                promise.reject("FETCH_KIOSK_UPDATE_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun listConfigBackups(promise: Promise) {
        Thread {
            try {
                val result = MdmConfigBackupClient.listConfigBackups(reactContext)
                val ownDeviceId = MdmAgentPrefs.getDeviceId(reactContext).orEmpty()
                val map = Arguments.createMap().apply {
                    putArray("groups", MdmConfigBackupClient.groupsToArray(result.optJSONArray("groups")))
                    putArray("backups", MdmConfigBackupClient.backupsToArray(result.optJSONArray("backups"), ownDeviceId))
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("LIST_CONFIG_BACKUPS_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun uploadConfigBackup(backupJson: String, label: String?, promise: Promise) {
        Thread {
            try {
                val result = MdmConfigBackupClient.uploadConfigBackup(reactContext, backupJson, label)
                val backup = result.optJSONObject("backup")
                val map = Arguments.createMap().apply {
                    if (backup != null) {
                        putString("id", backup.optString("id"))
                        putString("deviceId", backup.optString("deviceId"))
                        if (!backup.isNull("label")) {
                            putString("label", backup.optString("label"))
                        }
                        putInt("settingsCount", backup.optInt("settingsCount"))
                        putString("createdAt", backup.optString("createdAt"))
                    }
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("UPLOAD_CONFIG_BACKUP_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun fetchConfigBackup(backupId: String, promise: Promise) {
        Thread {
            try {
                val result = MdmConfigBackupClient.fetchConfigBackup(reactContext, backupId)
                val content = result.optJSONObject("content")
                val map = Arguments.createMap().apply {
                    putString("contentJson", content?.toString() ?: "{}")
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("FETCH_CONFIG_BACKUP_ERROR", e.message, e)
            }
        }.start()
    }

    private fun kioskUpdateToMap(json: org.json.JSONObject): WritableMap {
        return Arguments.createMap().apply {
            putString("packageName", json.optString("packageName"))
            if (!json.isNull("currentVersionCode")) {
                putInt("currentVersionCode", json.optInt("currentVersionCode"))
            }
            if (!json.isNull("currentVersionName")) {
                putString("currentVersionName", json.optString("currentVersionName"))
            }
            putBoolean("updateAvailable", json.optBoolean("updateAvailable", false))
            val latest = json.optJSONObject("latest")
            if (latest != null) {
                putMap("latest", Arguments.createMap().apply {
                    putInt("appId", latest.optInt("appId"))
                    putString("name", latest.optString("name"))
                    if (!latest.isNull("versionName")) {
                        putString("versionName", latest.optString("versionName"))
                    }
                    putInt("versionCode", latest.optInt("versionCode"))
                    putString("fileName", latest.optString("fileName"))
                    putDouble("fileSizeBytes", latest.optLong("fileSizeBytes").toDouble())
                    putString("sha256", latest.optString("sha256"))
                    putString("downloadUrl", latest.optString("downloadUrl"))
                })
            }
        }
    }

    private fun sendEvent(event: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }
}
