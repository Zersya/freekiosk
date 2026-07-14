package com.freekiosk

import java.io.InputStream

/**
 * Emits multipart/x-mixed-replace JPEG frames from ScreenCaptureManager at ~3-5 fps.
 */
class MjpegStreamInputStream(
    private val context: android.content.Context,
    private val frameIntervalMs: Long = 250,
    private val jpegQuality: Int = 60,
    private val onClose: (() -> Unit)? = null
) : InputStream() {

    companion object {
        private const val BOUNDARY = "freekiosk-frame"
    }

    @Volatile
    private var closed = false
    private var buffer = ByteArray(0)
    private var bufferPos = 0

    override fun read(): Int {
        val single = ByteArray(1)
        val read = read(single, 0, 1)
        return if (read < 0) -1 else single[0].toInt() and 0xFF
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (closed) return -1
        if (!ScreenCaptureManager.isCaptureReady(context)) {
            close()
            return -1
        }

        if (bufferPos >= buffer.size) {
            if (!loadNextFrame()) {
                close()
                return -1
            }
        }

        val available = buffer.size - bufferPos
        val toRead = minOf(len, available)
        System.arraycopy(buffer, bufferPos, b, off, toRead)
        bufferPos += toRead
        return toRead
    }

    private fun loadNextFrame(): Boolean {
        if (closed || !ScreenCaptureManager.isCaptureReady(context)) return false

        try {
            Thread.sleep(frameIntervalMs)
        } catch (_: InterruptedException) {
            return false
        }

        val jpeg = ScreenCaptureManager.getLatestJpegBytes(context, jpegQuality)
        if (jpeg == null || jpeg.isEmpty()) {
            buffer = ByteArray(0)
            bufferPos = 0
            return true
        }

        val header = (
            "--$BOUNDARY\r\n" +
                "Content-Type: image/jpeg\r\n" +
                "Content-Length: ${jpeg.size}\r\n" +
                "\r\n"
            ).toByteArray(Charsets.US_ASCII)

        buffer = ByteArray(header.size + jpeg.size)
        System.arraycopy(header, 0, buffer, 0, header.size)
        System.arraycopy(jpeg, 0, buffer, header.size, jpeg.size)
        bufferPos = 0
        return true
    }

    override fun close() {
        if (closed) return
        closed = true
        onClose?.invoke()
        super.close()
    }
}
