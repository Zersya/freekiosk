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
import java.util.concurrent.atomic.AtomicLong

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
    private val cacheLock = Any()
    private var cachedBitmap: Bitmap? = null
    private val cacheTimestampMs = AtomicLong(0L)

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

    fun startRefresh(context: Context, intervalMs: Long) {
        if (!isAvailable(context)) return
        refreshIntervalMs = intervalMs.coerceAtLeast(MIN_REFRESH_INTERVAL_MS)
        if (refreshHandler == null) {
            val thread = HandlerThread("DevOwnerCapture").apply { start() }
            val handler = Handler(thread.looper)
            refreshThread = thread
            refreshHandler = handler
            scheduleNext(context.applicationContext, handler, refreshIntervalMs)
        }
    }

    fun stopRefresh() {
        refreshHandler?.removeCallbacksAndMessages(null)
        refreshThread?.quitSafely()
        refreshHandler = null
        refreshThread = null
        refreshIntervalMs = 0L
        synchronized(cacheLock) {
            cachedBitmap?.takeUnless { it.isRecycled }?.recycle()
            cachedBitmap = null
            cacheTimestampMs.set(0L)
        }
    }

    private fun scheduleNext(context: Context, handler: Handler, intervalMs: Long) {
        handler.postDelayed({
            captureFreshBitmap(context)?.let { fresh ->
                synchronized(cacheLock) {
                    cachedBitmap?.takeUnless { it.isRecycled }?.recycle()
                    cachedBitmap = fresh
                    cacheTimestampMs.set(System.currentTimeMillis())
                }
            }
            if (refreshIntervalMs > 0) {
                scheduleNext(context, handler, refreshIntervalMs)
            }
        }, intervalMs)
    }

    fun capturePng(context: Context): ByteArray? {
        val bitmap = acquireBitmapForEncoding(context) ?: return null
        return try {
            encodePng(bitmap)
        } finally {
            recycleQuietly(bitmap)
        }
    }

    fun captureJpeg(context: Context, quality: Int = 60, maxDimension: Int = 0): ByteArray? {
        val bitmap = acquireBitmapForEncoding(context) ?: return null
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
            if (scaled != null && scaled !== bitmap) {
                recycleQuietly(scaled)
            }
            recycleQuietly(bitmap)
        }
    }

    /** Returns an owned bitmap copy safe for encoding on any thread. */
    private fun acquireBitmapForEncoding(context: Context): Bitmap? {
        synchronized(cacheLock) {
            val ageMs = System.currentTimeMillis() - cacheTimestampMs.get()
            val maxAge = if (refreshIntervalMs > 0) refreshIntervalMs * 3 else 0L
            if (maxAge > 0 && ageMs < maxAge) {
                copyBitmap(cachedBitmap)?.let { return it }
            }
        }
        val fresh = captureFreshBitmap(context) ?: return null
        val copy = copyBitmap(fresh)
        if (copy != null) {
            recycleQuietly(fresh)
            return copy
        }
        return fresh
    }

    private fun captureFreshBitmap(context: Context): Bitmap? {
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

    private fun copyBitmap(source: Bitmap?): Bitmap? {
        if (source == null || source.isRecycled) return null
        return try {
            source.copy(Bitmap.Config.ARGB_8888, false)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to copy bitmap: ${e.message}")
            null
        }
    }

    private fun recycleQuietly(bitmap: Bitmap?) {
        if (bitmap == null || bitmap.isRecycled) return
        try {
            bitmap.recycle()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to recycle bitmap: ${e.message}")
        }
    }

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
        if (maxDimension <= 0 || source.isRecycled) return null
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
