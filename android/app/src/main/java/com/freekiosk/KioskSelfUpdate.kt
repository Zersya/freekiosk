package com.freekiosk

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log

object KioskSelfUpdate {
    private const val TAG = "KioskSelfUpdate"

    fun restartApp(context: Context, delayMs: Long = 1000L) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent == null) {
            Log.e(TAG, "No launch intent for ${context.packageName}")
            return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        Handler(Looper.getMainLooper()).postDelayed({
            context.startActivity(launchIntent)
        }, delayMs)
    }
}
