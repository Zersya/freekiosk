package com.freekiosk.mdm

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.freekiosk.DeviceOwnerScreenCapture
import com.freekiosk.ScreenCaptureManager
import com.freekiosk.api.HttpServerModule
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class MdmAgentClient(private val context: Context) {

    companion object {
        private const val TAG = "MdmAgentClient"
        private const val PROTOCOL_VERSION = 1
        private const val STATUS_INTERVAL_MS = 30_000L
        // Cap the longest side of streamed frames so live view stays real-time.
        private const val STREAM_MAX_DIMENSION = 1080
        private const val STREAM_MAX_FPS = 15
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var streamThread: HandlerThread? = null
    private var streamHandler: Handler? = null
    private val httpClient = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var reconnectDelayMs = 1_000L
    private val disconnectRequested = AtomicBoolean(false)
    private val sessionReady = AtomicBoolean(false)

    @Volatile
    private var isConnected = false

    private var wifiLock: WifiManager.WifiLock? = null
    private var cpuWakeLock: PowerManager.WakeLock? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private var activeStreamSessionId: String? = null
    private var streamRunnable: Runnable? = null

    var onConnectionChanged: ((Boolean) -> Unit)? = null
    var onError: ((String) -> Unit)? = null

    private val statusRunnable = object : Runnable {
        override fun run() {
            publishStatus()
            if (!disconnectRequested.get() && sessionReady.get()) {
                mainHandler.postDelayed(this, STATUS_INTERVAL_MS)
            }
        }
    }

    private val reconnectRunnable = Runnable {
        if (!disconnectRequested.get()) {
            connect()
        }
    }

    fun isConnected(): Boolean = isConnected && sessionReady.get()

    fun connect() {
        if (disconnectRequested.get()) return

        val wsUrl = MdmAgentPrefs.getWsUrl(context)
        if (wsUrl.isNullOrBlank()) {
            onError?.invoke("MDM WebSocket URL is not configured")
            return
        }

        acquireLocks()
        registerNetworkCallback()

        val request = Request.Builder().url(wsUrl).build()
        webSocket?.cancel()
        webSocket = httpClient.newWebSocket(request, socketListener)
        Log.i(TAG, "Connecting to MDM agent hub: $wsUrl")
    }

    fun disconnect() {
        disconnectRequested.set(true)
        sessionReady.set(false)
        isConnected = false
        mainHandler.removeCallbacks(statusRunnable)
        mainHandler.removeCallbacks(reconnectRunnable)
        stopStreaming()
        streamThread?.quitSafely()
        streamThread = null
        streamHandler = null
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        releaseLocks()
        unregisterNetworkCallback()
        onConnectionChanged?.invoke(false)
    }

    fun reconnect() {
        disconnectRequested.set(false)
        connect()
    }

    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "WebSocket open")
            isConnected = true
            reconnectDelayMs = 1_000L
            sendHelloOrEnroll(webSocket)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleMessage(text)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closing: $code $reason")
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closed: $code $reason")
            handleDisconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "WebSocket failure: ${t.message}")
            onError?.invoke(t.message ?: "Connection failed")
            handleDisconnect()
        }
    }

    private fun handleDisconnect() {
        isConnected = false
        sessionReady.set(false)
        mainHandler.removeCallbacks(statusRunnable)
        stopStreaming()
        onConnectionChanged?.invoke(false)
        if (!disconnectRequested.get()) {
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.postDelayed(reconnectRunnable, reconnectDelayMs)
        reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(30_000L)
    }

    private fun sendHelloOrEnroll(socket: WebSocket) {
        val enrollmentToken = MdmAgentPrefs.getEnrollmentToken(context)
        val deviceId = MdmAgentPrefs.getDeviceId(context)
        val agentToken = MdmAgentPrefs.getAgentToken(context)
        val deviceKey = MdmAgentPrefs.getDeviceKey(context)
            ?: Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID).also {
                MdmAgentPrefs.setDeviceKey(context, it)
            }

        val payload = if (!enrollmentToken.isNullOrBlank()) {
            JSONObject().apply {
                put("type", "enroll")
                put("enrollmentToken", enrollmentToken)
                put("deviceKey", deviceKey)
                put("capabilities", org.json.JSONArray(listOf("status", "commands", "stream")))
                put("info", JSONObject().apply {
                    put("name", Build.MODEL)
                    put("model", Build.MODEL)
                    put("manufacturer", Build.MANUFACTURER)
                    put("androidVersion", Build.VERSION.RELEASE)
                })
            }
        } else if (deviceId > 0 && !agentToken.isNullOrBlank()) {
            JSONObject().apply {
                put("type", "hello")
                put("deviceId", deviceId)
                put("agentToken", agentToken)
                put("protocolVersion", PROTOCOL_VERSION)
                put("capabilities", org.json.JSONArray(listOf("status", "commands", "stream")))
            }
        } else {
            onError?.invoke("MDM agent is not enrolled")
            disconnectRequested.set(true)
            mainHandler.removeCallbacks(reconnectRunnable)
            socket.close(1008, "Not enrolled")
            return
        }

        socket.send(payload.toString())
    }

    private fun handleMessage(text: String) {
        try {
            val message = JSONObject(text)
            when (message.optString("type")) {
                "enrolled" -> {
                    val deviceId = message.optInt("deviceId", 0)
                    val agentToken = message.optString("agentToken", "")
                    if (deviceId <= 0 || agentToken.isBlank()) {
                        onError?.invoke("Invalid enroll response")
                        return
                    }
                    MdmAgentPrefs.saveEnrollmentResult(context, deviceId, agentToken)
                    sessionReady.set(true)
                    onConnectionChanged?.invoke(true)
                    publishStatus()
                    mainHandler.removeCallbacks(statusRunnable)
                    mainHandler.postDelayed(statusRunnable, STATUS_INTERVAL_MS)
                }
                "welcome" -> {
                    sessionReady.set(true)
                    onConnectionChanged?.invoke(true)
                    publishStatus()
                    mainHandler.removeCallbacks(statusRunnable)
                    mainHandler.postDelayed(statusRunnable, STATUS_INTERVAL_MS)
                }
                "command" -> handleCommand(message)
                "stream_start" -> handleStreamStart(message)
                "stream_stop" -> handleStreamStop(message)
                "error" -> onError?.invoke(message.optString("message", "Agent error"))
                "pong", "status_ack" -> Unit
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse agent message: ${e.message}")
        }
    }

    private fun handleCommand(message: JSONObject) {
        val requestId = message.optString("requestId", "")
        val command = message.optString("command", "")
        val params = message.optJSONObject("params")

        if (command == "screenshot") {
            handleScreenshotCommand(requestId, params)
            return
        }

        val result = try {
            HttpServerModule.dispatchCommand(command, params)
        } catch (e: Exception) {
            JSONObject().apply {
                put("executed", false)
                put("error", e.message ?: "Command failed")
            }
        }

        val success = result.optBoolean("executed", false) && !result.has("error")
        val response = JSONObject().apply {
            put("type", "command_result")
            put("requestId", requestId)
            put("success", success)
            put("data", result)
            if (!success) {
                put("error", result.optString("error", "Command failed"))
            }
        }
        webSocket?.send(response.toString())
    }

    private fun handleScreenshotCommand(requestId: String, params: JSONObject?) {
        val quality = params?.optInt("quality", 80)?.coerceIn(1, 100) ?: 80
        ensureStreamHandler().post {
            try {
                val png = ScreenCaptureManager.captureFrame(context)
                if (png != null) {
                    val bytes = png.readBytes()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val response = JSONObject().apply {
                        put("type", "command_result")
                        put("requestId", requestId)
                        put("success", true)
                        put("data", JSONObject().apply {
                            put("imageBase64", base64)
                            put("mimeType", "image/png")
                        })
                    }
                    webSocket?.send(response.toString())
                } else {
                    val jpegBytes = ScreenCaptureManager.getLatestJpegBytes(context, quality, STREAM_MAX_DIMENSION)
                    if (jpegBytes != null && jpegBytes.isNotEmpty()) {
                        val base64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
                        val response = JSONObject().apply {
                            put("type", "command_result")
                            put("requestId", requestId)
                            put("success", true)
                            put("data", JSONObject().apply {
                                put("imageBase64", base64)
                                put("mimeType", "image/jpeg")
                            })
                        }
                        webSocket?.send(response.toString())
                    } else {
                        val response = JSONObject().apply {
                            put("type", "command_result")
                            put("requestId", requestId)
                            put("success", false)
                            put("error", "Screen capture not available — enable Remote Screenshot in settings")
                        }
                        webSocket?.send(response.toString())
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Screenshot command failed: ${e.message}", e)
                val response = JSONObject().apply {
                    put("type", "command_result")
                    put("requestId", requestId)
                    put("success", false)
                    put("error", e.message ?: "Screenshot failed")
                }
                webSocket?.send(response.toString())
            }
        }
    }

    private fun handleStreamStart(message: JSONObject) {
        val sessionId = message.optString("sessionId", "")
        if (sessionId.isBlank()) return

        val fps = message.optInt("fps", 8).coerceIn(1, STREAM_MAX_FPS)
        val quality = message.optInt("quality", 60).coerceIn(1, 100)
        val intervalMs = (1000L / fps).coerceAtLeast(33L)

        stopStreaming()
        activeStreamSessionId = sessionId
        val handler = ensureStreamHandler()

        if (DeviceOwnerScreenCapture.isAvailable(context) && !ScreenCaptureManager.isActive()) {
            DeviceOwnerScreenCapture.startRefresh(context, intervalMs)
        }

        val runnable = object : Runnable {
            override fun run() {
                if (activeStreamSessionId != sessionId) return
                val socket = webSocket ?: return
                if (!sessionReady.get()) return

                if (!ScreenCaptureManager.isCaptureReady(context)) {
                    Log.w(TAG, "stream_start ignored — screen capture is not active")
                    handler.postDelayed(this, intervalMs)
                    return
                }

                val jpeg = ScreenCaptureManager.getLatestJpegBytes(context, quality, STREAM_MAX_DIMENSION)
                if (jpeg != null && jpeg.isNotEmpty()) {
                    val payload = JSONObject().apply {
                        put("type", "stream_frame")
                        put("sessionId", sessionId)
                        put("timestamp", System.currentTimeMillis() / 1000)
                        put("contentType", "image/jpeg")
                        put("data", Base64.encodeToString(jpeg, Base64.NO_WRAP))
                    }
                    socket.send(payload.toString())
                }

                handler.postDelayed(this, intervalMs)
            }
        }

        streamRunnable = runnable
        handler.post(runnable)
        Log.i(TAG, "Started agent stream session $sessionId at ${fps}fps")
    }

    private fun handleStreamStop(message: JSONObject) {
        val sessionId = message.optString("sessionId", "")
        if (sessionId.isBlank() || sessionId == activeStreamSessionId) {
            stopStreaming()
        }
    }

    private fun ensureStreamHandler(): Handler {
        streamHandler?.let { return it }
        val thread = HandlerThread("MdmAgentStream").apply { start() }
        val handler = Handler(thread.looper)
        streamThread = thread
        streamHandler = handler
        return handler
    }

    private fun stopStreaming() {
        streamRunnable?.let { streamHandler?.removeCallbacks(it) }
        streamRunnable = null
        activeStreamSessionId = null
        DeviceOwnerScreenCapture.stopRefresh()
    }

    private fun publishStatus() {
        val socket = webSocket ?: return
        if (!sessionReady.get()) return

        val status = HttpServerModule.buildDeviceStatus() ?: return
        val payload = JSONObject().apply {
            put("type", "status")
            put("data", status)
        }
        socket.send(payload.toString())
    }

    private fun acquireLocks() {
        try {
            if (wifiLock == null) {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "FreeKiosk:MdmAgent")
                wifiLock?.acquire()
            }
            if (cpuWakeLock == null) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                cpuWakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FreeKiosk:MdmAgentCPU")
                cpuWakeLock?.acquire()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire locks: ${e.message}")
        }
    }

    private fun releaseLocks() {
        try {
            wifiLock?.let { if (it.isHeld) it.release() }
            wifiLock = null
            cpuWakeLock?.let { if (it.isHeld) it.release() }
            cpuWakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to release locks: ${e.message}")
        }
    }

    private fun registerNetworkCallback() {
        if (networkCallback != null) return
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (!disconnectRequested.get() && !sessionReady.get()) {
                        mainHandler.post { connect() }
                    }
                }
            }
            connectivityManager.registerNetworkCallback(request, callback)
            networkCallback = callback
        } catch (e: Exception) {
            Log.w(TAG, "Network callback registration failed: ${e.message}")
        }
    }

    private fun unregisterNetworkCallback() {
        try {
            networkCallback?.let {
                val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                connectivityManager.unregisterNetworkCallback(it)
            }
        } catch (_: Exception) {
        } finally {
            networkCallback = null
        }
    }
}
