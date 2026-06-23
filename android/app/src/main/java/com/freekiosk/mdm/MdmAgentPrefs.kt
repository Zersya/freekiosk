package com.freekiosk.mdm

import android.content.Context

object MdmAgentPrefs {
    private const val PREFS = "freekiosk_mdm_agent"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_WS_URL = "ws_url"
    private const val KEY_ENROLLMENT_TOKEN = "enrollment_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_AGENT_TOKEN = "agent_token"
    private const val KEY_DEVICE_KEY = "device_key"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun getWsUrl(context: Context): String? =
        prefs(context).getString(KEY_WS_URL, null)?.takeIf { it.isNotBlank() }

    fun setWsUrl(context: Context, url: String) {
        prefs(context).edit().putString(KEY_WS_URL, url.trim()).apply()
    }

    fun getEnrollmentToken(context: Context): String? =
        prefs(context).getString(KEY_ENROLLMENT_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun setEnrollmentToken(context: Context, token: String?) {
        prefs(context).edit().putString(KEY_ENROLLMENT_TOKEN, token?.trim()).apply()
    }

    fun getDeviceId(context: Context): Int =
        prefs(context).getInt(KEY_DEVICE_ID, 0)

    fun setDeviceId(context: Context, deviceId: Int) {
        prefs(context).edit().putInt(KEY_DEVICE_ID, deviceId).apply()
    }

    fun getAgentToken(context: Context): String? =
        prefs(context).getString(KEY_AGENT_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun setAgentToken(context: Context, token: String?) {
        prefs(context).edit().putString(KEY_AGENT_TOKEN, token?.trim()).apply()
    }

    fun getDeviceKey(context: Context): String? =
        prefs(context).getString(KEY_DEVICE_KEY, null)?.takeIf { it.isNotBlank() }

    fun setDeviceKey(context: Context, deviceKey: String) {
        prefs(context).edit().putString(KEY_DEVICE_KEY, deviceKey).apply()
    }

    fun saveEnrollmentResult(context: Context, deviceId: Int, agentToken: String) {
        prefs(context).edit()
            .putInt(KEY_DEVICE_ID, deviceId)
            .putString(KEY_AGENT_TOKEN, agentToken)
            .remove(KEY_ENROLLMENT_TOKEN)
            .apply()
    }

    fun clearCredentials(context: Context) {
        prefs(context).edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_AGENT_TOKEN)
            .remove(KEY_ENROLLMENT_TOKEN)
            .apply()
    }
}
