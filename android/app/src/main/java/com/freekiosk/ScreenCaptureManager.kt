package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import java.util.concurrent.atomic.AtomicReference

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

    private val latestPngBytes = AtomicReference<ByteArray?>(null)

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
                latestPngBytes.set(imageToPngBytes(image))
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

    fun getLatestJpegBytes(quality: Int = 60): ByteArray? {
        var pngBytes = latestPngBytes.get()
        if (pngBytes == null || pngBytes.isEmpty()) {
            captureFrame()?.close()
            pngBytes = latestPngBytes.get()
        }
        if (pngBytes == null || pngBytes.isEmpty()) {
            return null
        }

        return try {
            val bitmap = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.size) ?: return null
            val outputStream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), outputStream)
            if (!bitmap.isRecycled) {
                bitmap.recycle()
            }
            outputStream.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to convert PNG to JPEG", e)
            null
        }
    }

    fun captureFrame(): ByteArrayInputStream? {
        if (!isActive()) {
            return null
        }

        latestPngBytes.get()?.let { bytes ->
            if (bytes.isNotEmpty()) {
                return ByteArrayInputStream(bytes)
            }
        }

        repeat(15) { attempt ->
            val image = imageReader?.acquireLatestImage()
            if (image != null) {
                try {
                    val bytes = imageToPngBytes(image)
                    latestPngBytes.set(bytes)
                    return ByteArrayInputStream(bytes)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to convert projection frame to PNG", e)
                } finally {
                    image.close()
                }
            }
            if (attempt < 14) {
                Thread.sleep(100)
            }
        }

        Log.w(TAG, "No MediaProjection frame available")
        return null
    }

    fun stopProjection() {
        latestPngBytes.set(null)

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

    private fun imageToPngBytes(image: Image): ByteArray {
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

        val cropped = if (rowPadding == 0) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height).also {
                if (!bitmap.isRecycled) {
                    bitmap.recycle()
                }
            }
        }

        val outputStream = ByteArrayOutputStream()
        cropped.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
        if (!cropped.isRecycled) {
            cropped.recycle()
        }
        return outputStream.toByteArray()
    }
}
