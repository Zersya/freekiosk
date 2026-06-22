package com.freekiosk

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

    @Volatile
    private var mediaProjection: MediaProjection? = null

    @Volatile
    private var virtualDisplay: VirtualDisplay? = null

    @Volatile
    private var imageReader: ImageReader? = null

    private var width = 0
    private var height = 0
    private var density = 0

    fun isActive(): Boolean = mediaProjection != null && imageReader != null

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

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        val display = projection.createVirtualDisplay(
            "FreeKioskScreenCapture",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface,
            null,
            null
        )

        projection.registerCallback(
            object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.d(TAG, "MediaProjection stopped by system")
                    stopProjection()
                }
            },
            Handler(Looper.getMainLooper())
        )

        mediaProjection = projection
        imageReader = reader
        virtualDisplay = display
        Log.d(TAG, "MediaProjection started (${width}x${height})")
    }

    fun captureFrame(): ByteArrayInputStream? {
        if (!isActive()) {
            return null
        }

        repeat(5) { attempt ->
            val image = imageReader?.acquireLatestImage()
            if (image != null) {
                try {
                    return imageToPngStream(image)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to convert projection frame to PNG", e)
                } finally {
                    image.close()
                }
            }
            if (attempt < 4) {
                Thread.sleep(100)
            }
        }

        Log.w(TAG, "No MediaProjection frame available yet")
        return null
    }

    fun stopProjection() {
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
    }

    private fun imageToPngStream(image: Image): ByteArrayInputStream {
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
        return ByteArrayInputStream(outputStream.toByteArray())
    }
}
