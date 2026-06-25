package com.freekiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service required for MediaProjection screen capture on Android 14+.
 */
class ScreenCaptureService : Service() {

    companion object {
        private const val TAG = "ScreenCaptureService"
        private const val CHANNEL_ID = "freekiosk_screen_capture"
        private const val NOTIFICATION_ID = 4102

        const val ACTION_START = "com.freekiosk.action.START_SCREEN_CAPTURE"
        const val ACTION_STOP = "com.freekiosk.action.STOP_SCREEN_CAPTURE"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"

        fun start(context: Context, resultCode: Int, data: Intent) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                ScreenCaptureManager.stopProjection(this, userInitiated = true)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START, null -> {
                if (intent == null) {
                    if (ScreenCaptureManager.isActive()) {
                        Log.d(TAG, "Service restarted — keeping active projection")
                        startForegroundWithNotification()
                        return START_STICKY
                    }
                    stopSelf()
                    return START_NOT_STICKY
                }

                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_RESULT_DATA)
                }
                if (resultData == null) {
                    Log.e(TAG, "Missing MediaProjection result data")
                    stopSelf()
                    return START_NOT_STICKY
                }

                startForegroundWithNotification()

                try {
                    ScreenCaptureManager.startProjection(this, resultCode, resultData)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start screen capture projection: ${e.message}", e)
                    ScreenCaptureManager.stopProjection()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        if (!ScreenCaptureManager.isActive()) {
            ScreenCaptureManager.stopProjection()
        }
        super.onDestroy()
    }

    private fun startForegroundWithNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Remote Screenshot",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Allows FreeKiosk REST API to capture the full screen"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FreeKiosk")
            .setContentText("Remote screenshot capture is active")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            } else {
                0
            }
            if (serviceType != 0) {
                startForeground(NOTIFICATION_ID, notification, serviceType)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }
}
