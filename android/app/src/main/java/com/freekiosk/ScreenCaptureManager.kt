package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Captures the full device screen via MediaProjection for /api/screenshot.
 * Requires one-time user consent and a foreground service on Android 14+.
 */
object ScreenCaptureManager {
    private const val TAG = "ScreenCaptureManager"
    private const val PREFS = "freekiosk_screen_capture"
    private const val KEY_REMOTE_ENABLED = "remote_enabled"

    @Volatile
    private var mediaProjection: MediaProjection? = null

    @Volatile
    private var virtualDisplay: VirtualDisplay? = null

    @Volatile
    private var imageReader: ImageReader? = null

    private var width = 0
    private var height = 0
    private var density = 0

    private var captureThread: HandlerThread? = null
    private var captureHandler: Handler? = null

    // The latest captured frame is kept as a Bitmap so we can encode JPEG (stream)
    // or PNG (single screenshot) on demand. This avoids the previous per-frame
    // PNG-encode + PNG-decode + JPEG-encode round trip that made live view lag.
    private val frameLock = Any()
    private var latestBitmap: Bitmap? = null

    fun isActive(): Boolean = mediaProjection != null && imageReader != null

    fun setRemoteCaptureEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REMOTE_ENABLED, enabled)
            .apply()
    }

    fun isRemoteCaptureEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_REMOTE_ENABLED, false)
    }

    fun shouldAllowScreenCapture(context: Context): Boolean {
        return isActive() || isRemoteCaptureEnabled(context)
    }

    fun startProjection(context: Context, resultCode: Int, data: Intent) {
        stopProjection()

        val projectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
            as MediaProjectionManager
        val projection = projectionManager.getMediaProjection(resultCode, data)
            ?: throw IllegalStateException("MediaProjection permission was not granted")

        val metrics = context.resources.displayMetrics
        width = metrics.widthPixels
        height = metrics.heightPixels
        density = metrics.densityDpi

        ensureCaptureThread()

        projection.registerCallback(
            object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.w(TAG, "MediaProjection stopped by system")
                    stopProjection()
                    setRemoteCaptureEnabled(context.applicationContext, false)
                    syncDeviceOwnerScreenCapturePolicy(context.applicationContext)
                }
            },
            Handler(Looper.getMainLooper())
        )

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        reader.setOnImageAvailableListener({ imageReader ->
            val image = imageReader.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val bitmap = imageToBitmap(image)
                synchronized(frameLock) {
                    latestBitmap?.recycle()
                    latestBitmap = bitmap
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to cache projection frame", e)
            } finally {
                image.close()
            }
        }, captureHandler)

        val display = projection.createVirtualDisplay(
            "FreeKioskScreenCapture",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface,
            null,
            captureHandler
        )

        mediaProjection = projection
        imageReader = reader
        virtualDisplay = display
        setRemoteCaptureEnabled(context.applicationContext, true)
        syncDeviceOwnerScreenCapturePolicy(context.applicationContext)
        Log.d(TAG, "MediaProjection started (${width}x${height})")
    }

    fun getCaptureSize(): Pair<Int, Int> = Pair(width, height)

    /**
     * Encodes the most recent frame straight to JPEG. Optionally downscales so the
     * longest side is at most [maxDimension] (0 = keep native resolution), which keeps
     * live-view frames small enough to stay real-time.
     */
    fun getLatestJpegBytes(quality: Int = 60, maxDimension: Int = 0): ByteArray? {
        if (!isActive()) {
            return null
        }
        ensureLatestBitmap()

        return synchronized(frameLock) {
            val source = latestBitmap ?: return@synchronized null
            val scaled = downscaleIfNeeded(source, maxDimension)
            val target = scaled ?: source
            try {
                val outputStream = ByteArrayOutputStream()
                target.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), outputStream)
                outputStream.toByteArray()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to encode JPEG frame", e)
                null
            } finally {
                if (scaled != null && scaled !== source && !scaled.isRecycled) {
                    scaled.recycle()
                }
            }
        }
    }

    fun captureFrame(): ByteArrayInputStream? {
        if (!isActive()) {
            return null
        }
        ensureLatestBitmap()

        return synchronized(frameLock) {
            val source = latestBitmap ?: run {
                Log.w(TAG, "No MediaProjection frame available")
                return@synchronized null
            }
            try {
                val outputStream = ByteArrayOutputStream()
                source.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                ByteArrayInputStream(outputStream.toByteArray())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to encode PNG frame", e)
                null
            }
        }
    }

    /** Pulls a frame synchronously if the listener hasn't produced one yet. */
    private fun ensureLatestBitmap() {
        synchronized(frameLock) {
            if (latestBitmap != null) return
        }

        repeat(15) { attempt ->
            val image = imageReader?.acquireLatestImage()
            if (image != null) {
                try {
                    val bitmap = imageToBitmap(image)
                    synchronized(frameLock) {
                        latestBitmap?.recycle()
                        latestBitmap = bitmap
                    }
                    return
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to convert projection frame", e)
                } finally {
                    image.close()
                }
            }
            if (attempt < 14) {
                Thread.sleep(100)
            }
        }
    }

    private fun downscaleIfNeeded(source: Bitmap, maxDimension: Int): Bitmap? {
        if (maxDimension <= 0) return null
        val longest = maxOf(source.width, source.height)
        if (longest <= maxDimension) return null

        val scale = maxDimension.toFloat() / longest
        val targetWidth = (source.width * scale).toInt().coerceAtLeast(1)
        val targetHeight = (source.height * scale).toInt().coerceAtLeast(1)
        return try {
            Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to downscale frame: ${e.message}")
            null
        }
    }

    fun stopProjection() {
        synchronized(frameLock) {
            latestBitmap?.recycle()
            latestBitmap = null
        }

        try {
            virtualDisplay?.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing virtual display: ${e.message}")
        }
        virtualDisplay = null

        try {
            imageReader?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing image reader: ${e.message}")
        }
        imageReader = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping media projection: ${e.message}")
        }
        mediaProjection = null

        captureThread?.quitSafely()
        captureThread = null
        captureHandler = null
    }

    fun stopProjection(context: Context) {
        stopProjection()
        setRemoteCaptureEnabled(context.applicationContext, false)
        syncDeviceOwnerScreenCapturePolicy(context.applicationContext)
    }

    /**
     * Device Owner kiosk mode normally disables all screen capture. Re-allow it when
     * remote screenshot is enabled so MediaProjection keeps working in lock task mode.
     */
    fun syncDeviceOwnerScreenCapturePolicy(context: Context) {
        try {
            val appContext = context.applicationContext
            val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(appContext.packageName)) {
                return
            }
            val adminComponent = ComponentName(appContext, DeviceAdminReceiver::class.java)
            val disableCapture = !shouldAllowScreenCapture(appContext)
            dpm.setScreenCaptureDisabled(adminComponent, disableCapture)
            Log.d(TAG, "Device Owner screen capture disabled=$disableCapture")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to sync screen capture policy: ${e.message}")
        }
    }

    private fun ensureCaptureThread() {
        if (captureThread == null) {
            captureThread = HandlerThread("FreeKioskScreenCapture").apply { start() }
            captureHandler = Handler(captureThread!!.looper)
        }
    }

    private fun imageToBitmap(image: Image): Bitmap {
        val plane = image.planes[0]
        val buffer: ByteBuffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width

        val bitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)

        return if (rowPadding == 0) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height).also {
                if (!bitmap.isRecycled) {
                    bitmap.recycle()
                }
            }
        }
    }
}
