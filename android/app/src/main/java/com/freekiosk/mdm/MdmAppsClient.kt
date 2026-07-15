package com.freekiosk.mdm

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object MdmInstallReporter {
    private const val TAG = "MdmInstallReporter"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    fun reportStatus(context: Context, appId: Int, status: String, errorMessage: String?) {
        val deviceId = MdmAgentPrefs.getDeviceId(context)
        val agentToken = MdmAgentPrefs.getAgentToken(context)
        val baseUrl = MdmAppsClient.getRestBaseUrl(context)

        if (deviceId.isNullOrBlank() || agentToken.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            return
        }

        Thread {
            try {
                val body = JSONObject().apply {
                    put("status", status)
                    if (!errorMessage.isNullOrBlank()) {
                        put("errorMessage", errorMessage)
                    }
                }

                val request = Request.Builder()
                    .url("$baseUrl/api/agent/apps/$appId/install-status?deviceId=$deviceId")
                    .patch(body.toString().toRequestBody("application/json".toMediaType()))
                    .header("Authorization", "Bearer $agentToken")
                    .header("Accept", "application/json")
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.w(TAG, "Install status report failed: HTTP ${response.code}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Install status report failed", e)
            }
        }.start()
    }
}

object MdmAppsClient {
    private const val TAG = "MdmAppsClient"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun getRestBaseUrl(context: Context): String? {
        val wsUrl = MdmAgentPrefs.getWsUrl(context) ?: return null
        return wsUrl
            .replace("wss://", "https://")
            .replace("ws://", "http://")
            .replace("/api/agent/ws", "")
            .trimEnd('/')
            .ifBlank { null }
    }

    fun fetchAvailableApps(context: Context): JSONObject {
        val deviceId = MdmAgentPrefs.getDeviceId(context)
        val agentToken = MdmAgentPrefs.getAgentToken(context)
        val baseUrl = getRestBaseUrl(context)

        if (deviceId.isNullOrBlank() || agentToken.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            throw IllegalStateException("MDM agent is not enrolled")
        }

        val request = Request.Builder()
            .url("$baseUrl/api/agent/apps?deviceId=$deviceId")
            .get()
            .header("Authorization", "Bearer $agentToken")
            .header("Accept", "application/json")
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("Failed to fetch apps: HTTP ${response.code} $body")
            }
            return JSONObject(body)
        }
    }
}
