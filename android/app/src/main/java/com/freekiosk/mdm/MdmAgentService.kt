package com.freekiosk.mdm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.freekiosk.MainActivity
import com.freekiosk.R

class MdmAgentService : Service() {

    companion object {
        private const val TAG = "MdmAgentService"
        private const val CHANNEL_ID = "freekiosk_mdm_agent"
        private const val NOTIFICATION_ID = 4108

        @Volatile
        private var client: MdmAgentClient? = null

        fun start(context: Context) {
            val intent = Intent(context, MdmAgentService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MdmAgentService::class.java))
        }

        fun isConnected(): Boolean = client?.isConnected() == true

        fun reconnectIfNeeded() {
            client?.reconnect()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Connecting to MDM…"))
        client = MdmAgentClient(applicationContext).apply {
            onConnectionChanged = { connected ->
                val text = if (connected) "Connected to MDM" else "Reconnecting to MDM…"
                updateNotification(text)
            }
            onError = { message ->
                Log.w(TAG, message)
            }
            connect()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        client?.reconnect()
        return START_STICKY
    }

    override fun onDestroy() {
        client?.disconnect()
        client = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "MDM Agent",
            NotificationManager.IMPORTANCE_LOW
        )
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(content: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.setContentTitle("FreeKiosk MDM Agent")
            .setContentText(content)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(content: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(content))
    }
}
