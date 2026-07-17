package com.freekiosk.mdm

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.atomic.AtomicBoolean

class MdmLogcatReader(
    private val onLine: (String) -> Unit,
    private val onScopeResolved: (String) -> Unit,
    private val onStopped: () -> Unit,
) {
    companion object {
        private const val TAG = "MdmLogcatReader"
        private val SCOPED_TAGS = listOf(
            "MdmAgentClient",
            "MdmAgentService",
            "MdmLogcatReader",
            "MainActivity",
            "HttpServerModule",
            "KioskModule",
            "OverlayService",
            "ScreenCaptureManager",
            "ReactNativeJS",
            "ReactNative",
        )
    }

    private val running = AtomicBoolean(false)
    private var readerThread: Thread? = null
    private var logcatProcess: java.lang.Process? = null

    @Suppress("UNUSED_PARAMETER")
    fun start(filter: JSONObject? = null) {
        if (!running.compareAndSet(false, true)) return

        readerThread = Thread {
            val args = resolveLogcatArgs()
            val scope = if (args.contains("--uid=")) "scoped" else "full"
            try {
                onScopeResolved(scope)
                readLogcat(args)
            } catch (e: Exception) {
                Log.w(TAG, "Logcat reader failed: ${e.message}")
            } finally {
                running.set(false)
                cleanupProcess()
                onStopped()
            }
        }.apply {
            name = "MdmLogcatReader"
            start()
        }
    }

    fun stop() {
        running.set(false)
        cleanupProcess()
        readerThread?.interrupt()
        readerThread = null
    }

    private fun resolveLogcatArgs(): List<String> {
        return try {
            val probe = ProcessBuilder("logcat", "-d", "-t", "1")
                .redirectErrorStream(true)
                .start()
            probe.waitFor()
            probe.destroy()
            buildFullArgs()
        } catch (e: Exception) {
            Log.w(TAG, "Full logcat unavailable, using scoped reader: ${e.message}")
            buildScopedArgs()
        }
    }

    private fun buildFullArgs(): List<String> {
        return listOf("logcat", "-v", "threadtime")
    }

    private fun buildScopedArgs(): List<String> {
        val uid = android.os.Process.myUid()
        val tagFilter = SCOPED_TAGS.joinToString(" ") { "$it:D" }
        return listOf("logcat", "-v", "threadtime", "--uid=$uid", "-s", tagFilter)
    }

    private fun readLogcat(args: List<String>) {
        cleanupProcess()
        val proc = ProcessBuilder(args)
            .redirectErrorStream(true)
            .start()
        logcatProcess = proc

        BufferedReader(InputStreamReader(proc.inputStream)).use { reader ->
            while (running.get()) {
                val line = reader.readLine() ?: break
                if (line.isBlank()) continue
                onLine(line)
            }
        }
    }

    private fun cleanupProcess() {
        try {
            logcatProcess?.destroy()
        } catch (_: Exception) {
        }
        try {
            logcatProcess?.destroyForcibly()
        } catch (_: Exception) {
        }
        logcatProcess = null
    }
}
