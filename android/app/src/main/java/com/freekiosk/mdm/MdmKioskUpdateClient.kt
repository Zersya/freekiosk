package com.freekiosk.mdm

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object MdmKioskUpdateClient {
    private const val TAG = "MdmKioskUpdateClient"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun fetchKioskUpdate(context: Context): JSONObject {
        val deviceId = MdmAgentPrefs.getDeviceId(context)
        val agentToken = MdmAgentPrefs.getAgentToken(context)
        val baseUrl = MdmAppsClient.getRestBaseUrl(context)

        if (deviceId <= 0 || agentToken.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            throw IllegalStateException("MDM agent is not enrolled")
        }

        val request = Request.Builder()
            .url("$baseUrl/api/agent/kiosk-update?deviceId=$deviceId")
            .get()
            .header("Authorization", "Bearer $agentToken")
            .header("Accept", "application/json")
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                Log.w(TAG, "Kiosk update check failed: HTTP ${response.code} $body")
                throw IllegalStateException("Failed to check kiosk update: HTTP ${response.code}")
            }
            return JSONObject(body)
        }
    }
}
