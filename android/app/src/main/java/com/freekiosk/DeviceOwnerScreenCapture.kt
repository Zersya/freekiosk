package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Full-display capture without MediaProjection consent.
 * Tries AccessibilityService.takeScreenshot first (works on Samsung DO kiosks),
 * then DevicePolicyManager.takeScreenshot as a fallback.
 */
object DeviceOwnerScreenCapture {
    private const val TAG = "DeviceOwnerScreenCapture"
    private const val CAPTURE_TIMEOUT_SEC = 10L
    private const val MIN_REFRESH_INTERVAL_MS = 750L

    private val captureInProgress = AtomicBoolean(false)
    private val cachedBitmap = AtomicReference<Bitmap?>(null)
    private val cacheTimestampMs = AtomicReference<Long>(0L)

    @Volatile private var refreshHandler: Handler? = null
    @Volatile private var refreshThread: HandlerThread? = null
    @Volatile private var refreshIntervalMs: Long = 0L

    fun isAvailable(context: Context): Boolean {
        if (isAccessibilityCaptureAvailable()) return true
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun isAccessibilityCaptureAvailable(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && FreeKioskAccessibilityService.isRunning()
    }

    // ── Background refresh ─────────────────────────────────────────────────────

    /**
     * Start a background loop that refreshes the cached frame at [intervalMs].
     * Call this when streaming begins; call [stopRefresh] when streaming stops.
     */
    fun startRefresh(context: Context, intervalMs: Long) {
        if (!isAvailable(context)) return
        refreshIntervalMs = intervalMs.coerceAtLeast(MIN_REFRESH_INTERVAL_MS)
        if (refreshHandler == null) {
            val thread = HandlerThread("DevOwnerCapture").apply { start() }
            val handler = Handler(thread.looper)
            refreshThread = thread
            refreshHandler = handler
            scheduleNext(context, handler, intervalMs)
        }
    }

    fun stopRefresh() {
        refreshHandler?.removeCallbacksAndMessages(null)
        refreshThread?.quitSafely()
        refreshHandler = null
        refreshThread = null
        refreshIntervalMs = 0L
    }

    private fun scheduleNext(context: Context, handler: Handler, intervalMs: Long) {
        handler.postDelayed({
            captureBitmapInternal(context)?.let { fresh ->
                val old = cachedBitmap.getAndSet(fresh)
                if (old != null && !old.isRecycled) old.recycle()
                cacheTimestampMs.set(System.currentTimeMillis())
            }
            if (refreshIntervalMs > 0) {
                scheduleNext(context, handler, intervalMs)
            }
        }, intervalMs)
    }

    // ── Synchronous single capture ─────────────────────────────────────────────

    /**
     * Returns a PNG-encoded screenshot. Uses the cache if it's fresh (< 2x intervalMs),
     * otherwise blocks for up to [CAPTURE_TIMEOUT_SEC] seconds.
     */
    fun capturePng(context: Context): ByteArray? {
        val bitmap = getCachedOrCapture(context) ?: return null
        return encodePng(bitmap)
    }

    /**
     * Returns a JPEG-encoded screenshot, optionally downscaled.
     * Non-blocking if the background refresh loop is running.
     */
    fun captureJpeg(context: Context, quality: Int = 60, maxDimension: Int = 0): ByteArray? {
        val bitmap = getCachedOrCapture(context) ?: return null
        val scaled = downscaleIfNeeded(bitmap, maxDimension)
        val target = scaled ?: bitmap
        return try {
            val out = ByteArrayOutputStream()
            target.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), out)
            out.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode JPEG", e)
            null
        } finally {
            if (scaled != null && scaled !== bitmap && !scaled.isRecycled) scaled.recycle()
        }
    }

    private fun getCachedOrCapture(context: Context): Bitmap? {
        val ageMs = System.currentTimeMillis() - cacheTimestampMs.get()
        val maxAge = if (refreshIntervalMs > 0) refreshIntervalMs * 3 else 0L

        if (maxAge > 0 && ageMs < maxAge) {
            val cached = cachedBitmap.get()
            if (cached != null && !cached.isRecycled) return cached
        }
        return captureBitmapInternal(context)
    }

    // ── DPM capture internals ──────────────────────────────────────────────────

    fun captureBitmapInternal(context: Context): Bitmap? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null

        FreeKioskAccessibilityService.takeScreenshotBitmap()?.let { return it }

        if (!isDeviceOwner(context)) return null
        if (!captureInProgress.compareAndSet(false, true)) return null

        return try {
            val appContext = context.applicationContext
            val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(appContext, DeviceAdminReceiver::class.java)
            var bitmap: Bitmap? = null
            val latch = CountDownLatch(1)

            val takeScreenshotMethod = dpm.javaClass.getMethod(
                "takeScreenshot",
                ComponentName::class.java,
                java.util.concurrent.Executor::class.java,
                java.util.function.Consumer::class.java
            )
            val callback = java.util.function.Consumer<Any> { result ->
                try {
                    bitmap = result.javaClass.getMethod("getBitmap").invoke(result) as? Bitmap
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to get bitmap from DPM result", e)
                } finally {
                    latch.countDown()
                }
            }
            takeScreenshotMethod.invoke(dpm, adminComponent, appContext.mainExecutor, callback)

            if (!latch.await(CAPTURE_TIMEOUT_SEC, TimeUnit.SECONDS)) {
                Log.w(TAG, "DPM takeScreenshot timed out")
                null
            } else {
                bitmap
            }
        } catch (e: Exception) {
            Log.w(TAG, "DPM takeScreenshot not available: ${e.message}")
            null
        } finally {
            captureInProgress.set(false)
        }
    }

    private fun isDeviceOwner(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun encodePng(bitmap: Bitmap): ByteArray? {
        return try {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode PNG", e)
            null
        }
    }

    private fun downscaleIfNeeded(source: Bitmap, maxDimension: Int): Bitmap? {
        if (maxDimension <= 0) return null
        val longest = maxOf(source.width, source.height)
        if (longest <= maxDimension) return null
        val scale = maxDimension.toFloat() / longest
        val w = (source.width * scale).toInt().coerceAtLeast(1)
        val h = (source.height * scale).toInt().coerceAtLeast(1)
        return try {
            Bitmap.createScaledBitmap(source, w, h, true)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to downscale: ${e.message}")
            null
        }
    }
}
