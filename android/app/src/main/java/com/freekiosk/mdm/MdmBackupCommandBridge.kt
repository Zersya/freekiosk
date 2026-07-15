package com.freekiosk.mdm

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Runs MDM backup/restore commands that require the React Native layer (AsyncStorage).
 */
object MdmBackupCommandBridge {
    private const val TAG = "MdmBackupCommandBridge"

    private data class Pending(
        val latch: CountDownLatch,
        var result: JSONObject? = null,
    )

    private val pending = ConcurrentHashMap<String, Pending>()

    @Volatile
    private var reactContext: ReactApplicationContext? = null

    fun attach(context: ReactApplicationContext) {
        reactContext = context
    }

    fun detach() {
        reactContext = null
        pending.values.forEach { it.latch.countDown() }
        pending.clear()
    }

    fun resolve(requestId: String, success: Boolean, data: JSONObject?, error: String?) {
        val entry = pending.remove(requestId) ?: return
        entry.result = JSONObject().apply {
            put("executed", success)
            put("success", success)
            if (data != null) put("data", data)
            if (!success) put("error", error ?: "MDM config command failed")
        }
        entry.latch.countDown()
    }

    fun runBackup(label: String?, timeoutMs: Long): JSONObject {
        return runCommand(
            action = "backup",
            params = JSONObject().apply {
                if (!label.isNullOrBlank()) put("label", label.trim())
            },
            timeoutMs = timeoutMs,
        )
    }

    fun runRestore(backupId: String, timeoutMs: Long): JSONObject {
        if (backupId.isBlank()) {
            return errorResult("backupId is required")
        }
        return runCommand(
            action = "restore",
            params = JSONObject().apply { put("backupId", backupId) },
            timeoutMs = timeoutMs,
        )
    }

    private fun runCommand(action: String, params: JSONObject, timeoutMs: Long): JSONObject {
        val context = reactContext
        if (context == null || !context.hasActiveReactInstance()) {
            return errorResult("TransKIOSK app is not ready")
        }

        if (!MdmAgentPrefs.isEnrolled(context)) {
            return errorResult("MDM agent is not enrolled")
        }

        val requestId = UUID.randomUUID().toString()
        val entry = Pending(CountDownLatch(1))
        pending[requestId] = entry

        try {
            val payload = Arguments.createMap().apply {
                putString("requestId", requestId)
                putString("action", action)
                putString("params", params.toString())
            }

            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onMdmConfigCommand", payload)

            val completed = entry.latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            if (!completed) {
                pending.remove(requestId)
                return errorResult("MDM config command timed out")
            }

            return entry.result ?: errorResult("MDM config command returned no result")
        } catch (e: Exception) {
            pending.remove(requestId)
            Log.e(TAG, "MDM config command failed", e)
            return errorResult(e.message ?: "MDM config command failed")
        }
    }

    private fun errorResult(message: String): JSONObject {
        return JSONObject().apply {
            put("executed", false)
            put("success", false)
            put("error", message)
        }
    }
}
