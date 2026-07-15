package com.freekiosk.mdm

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object MdmConfigBackupClient {
    private const val TAG = "MdmConfigBackupClient"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private fun authContext(context: Context): Triple<String, String, String> {
        val deviceId = MdmAgentPrefs.getDeviceId(context)
        val agentToken = MdmAgentPrefs.getAgentToken(context)
        val baseUrl = MdmAppsClient.getRestBaseUrl(context)

        if (deviceId.isNullOrBlank() || agentToken.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            throw IllegalStateException("MDM agent is not enrolled")
        }

        return Triple(deviceId, agentToken, baseUrl)
    }

    fun listConfigBackups(context: Context): JSONObject {
        val (deviceId, agentToken, baseUrl) = authContext(context)

        val request = Request.Builder()
            .url("$baseUrl/api/agent/config-backups?deviceId=$deviceId")
            .get()
            .header("Authorization", "Bearer $agentToken")
            .header("Accept", "application/json")
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                Log.w(TAG, "List config backups failed: HTTP ${response.code} $body")
                throw IllegalStateException("Failed to list config backups: HTTP ${response.code}")
            }
            return JSONObject(body)
        }
    }

    fun uploadConfigBackup(context: Context, backupJson: String, label: String?): JSONObject {
        val (deviceId, agentToken, baseUrl) = authContext(context)
        val backupObject = JSONObject(backupJson)

        val payload = JSONObject().apply {
            put("backup", backupObject)
            if (!label.isNullOrBlank()) {
                put("label", label.trim())
            }
        }

        val request = Request.Builder()
            .url("$baseUrl/api/agent/config-backups?deviceId=$deviceId")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $agentToken")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                Log.w(TAG, "Upload config backup failed: HTTP ${response.code} $body")
                throw IllegalStateException("Failed to upload config backup: HTTP ${response.code}")
            }
            return JSONObject(body)
        }
    }

    fun fetchConfigBackup(context: Context, backupId: String): JSONObject {
        val (deviceId, agentToken, baseUrl) = authContext(context)

        val request = Request.Builder()
            .url("$baseUrl/api/agent/config-backups/$backupId?deviceId=$deviceId")
            .get()
            .header("Authorization", "Bearer $agentToken")
            .header("Accept", "application/json")
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                Log.w(TAG, "Fetch config backup failed: HTTP ${response.code} $body")
                throw IllegalStateException("Failed to fetch config backup: HTTP ${response.code}")
            }
            return JSONObject(body)
        }
    }

    fun groupsToArray(groups: JSONArray?): com.facebook.react.bridge.WritableArray {
        val array = com.facebook.react.bridge.Arguments.createArray()
        if (groups == null) return array

        for (i in 0 until groups.length()) {
            val group = groups.getJSONObject(i)
            array.pushMap(com.facebook.react.bridge.Arguments.createMap().apply {
                putString("id", group.optString("id"))
                putString("name", group.optString("name"))
                if (!group.isNull("color")) {
                    putString("color", group.optString("color"))
                }
            })
        }
        return array
    }

    fun backupsToArray(backups: JSONArray?, ownDeviceId: String): com.facebook.react.bridge.WritableArray {
        val array = com.facebook.react.bridge.Arguments.createArray()
        if (backups == null) return array

        for (i in 0 until backups.length()) {
            val backup = backups.getJSONObject(i)
            val groupNames = backup.optJSONArray("groupNames")
            val groupNameArray = com.facebook.react.bridge.Arguments.createArray()
            if (groupNames != null) {
                for (j in 0 until groupNames.length()) {
                    groupNameArray.pushString(groupNames.getString(j))
                }
            }

            array.pushMap(com.facebook.react.bridge.Arguments.createMap().apply {
                putString("id", backup.optString("id"))
                putString("deviceId", backup.optString("deviceId"))
                putString("deviceName", backup.optString("deviceName"))
                if (!backup.isNull("label")) {
                    putString("label", backup.optString("label"))
                }
                if (!backup.isNull("appVersion")) {
                    putString("appVersion", backup.optString("appVersion"))
                }
                if (!backup.isNull("exportDate")) {
                    putString("exportDate", backup.optString("exportDate"))
                }
                putInt("settingsCount", backup.optInt("settingsCount"))
                putBoolean("hasPinConfigured", backup.optBoolean("hasPinConfigured", false))
                putString("createdAt", backup.optString("createdAt"))
                putArray("groupNames", groupNameArray)
                putBoolean("isOwnDevice", backup.optBoolean("isOwnDevice", backup.optString("deviceId") == ownDeviceId))
            })
        }
        return array
    }
}
