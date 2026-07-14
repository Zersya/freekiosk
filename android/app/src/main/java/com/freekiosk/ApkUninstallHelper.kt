package com.freekiosk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

object ApkUninstallHelper {
    private const val TAG = "ApkUninstallHelper"

    fun uninstall(
        context: Context,
        packageName: String,
        appId: Int? = null,
        waitForCompletion: Boolean = true,
        timeoutMs: Long = 60_000L,
    ): JSONObject {
        if (packageName.isBlank()) {
            return failure("packageName is required", appId)
        }

        if (packageName == context.packageName) {
            return failure("Cannot uninstall the kiosk app", appId)
        }

        val pm = context.packageManager
        val installed = try {
            pm.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

        if (!installed) {
            ManagedAppsStorage.unregisterInstalledApp(context, packageName)
            reportUninstallStatus(context, appId)
            notifyManagedAppsChanged(context)
            return JSONObject().apply {
                put("success", true)
                put("status", "uninstalled")
                put("packageName", packageName)
                if (appId != null && appId > 0) put("appId", appId)
                put("message", "Package was not installed")
            }
        }

        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(context.packageName)) {
            return failure("Silent uninstall requires Device Owner mode", appId)
        }

        val jobId = UUID.randomUUID().toString()
        val resultRef = AtomicReference<JSONObject>()
        val latch = if (waitForCompletion) CountDownLatch(1) else null

        ApkUninstallReceiver.registerJob(jobId, object : ApkUninstallReceiver.JobCallback {
            override fun onSuccess() {
                ManagedAppsStorage.unregisterInstalledApp(context, packageName)
                reportUninstallStatus(context, appId)
                notifyManagedAppsChanged(context)
                resultRef.set(JSONObject().apply {
                    put("success", true)
                    put("status", "uninstalled")
                    put("packageName", packageName)
                    if (appId != null && appId > 0) put("appId", appId)
                })
                latch?.countDown()
            }

            override fun onFailure(message: String?) {
                resultRef.set(failure(message ?: "Uninstall failed", appId, packageName))
                latch?.countDown()
            }
        })

        try {
            val intent = Intent(context, ApkUninstallReceiver::class.java).apply {
                putExtra(ApkUninstallReceiver.EXTRA_JOB_ID, jobId)
                putExtra(ApkUninstallReceiver.EXTRA_PACKAGE_NAME, packageName)
                if (appId != null && appId > 0) {
                    putExtra(ApkUninstallReceiver.EXTRA_APP_ID, appId)
                }
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                jobId.hashCode(),
                intent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                },
            )

            pm.packageInstaller.uninstall(packageName, pendingIntent.intentSender)
        } catch (e: Exception) {
            ApkUninstallReceiver.cancelJob(jobId)
            Log.e(TAG, "Uninstall request failed", e)
            return failure(e.message ?: "Uninstall failed", appId, packageName)
        }

        if (!waitForCompletion) {
            return JSONObject().apply {
                put("success", true)
                put("status", "queued")
                put("jobId", jobId)
                put("packageName", packageName)
                if (appId != null && appId > 0) put("appId", appId)
            }
        }

        val completed = latch?.await(timeoutMs, TimeUnit.MILLISECONDS) == true
        if (!completed) {
            ApkUninstallReceiver.cancelJob(jobId)
            return failure("Uninstall timed out", appId, packageName)
        }

        return resultRef.get() ?: failure("Uninstall did not return a result", appId, packageName)
    }

    private fun failure(error: String, appId: Int?, packageName: String? = null): JSONObject {
        return JSONObject().apply {
            put("success", false)
            put("status", "failed")
            put("error", error)
            if (packageName != null) put("packageName", packageName)
            if (appId != null && appId > 0) put("appId", appId)
        }
    }

    private fun reportUninstallStatus(context: Context, appId: Int?) {
        val id = appId ?: return
        com.freekiosk.mdm.MdmInstallReporter.reportStatus(context, id, "uninstalled", null)
    }

    private fun notifyManagedAppsChanged(context: Context) {
        com.freekiosk.api.HttpServerModule.notifyManagedAppsChanged(context)
    }
}

class ApkUninstallReceiver : BroadcastReceiver() {
    interface JobCallback {
        fun onSuccess()
        fun onFailure(message: String?)
    }

    companion object {
        const val EXTRA_JOB_ID = "uninstall_job_id"
        const val EXTRA_PACKAGE_NAME = "uninstall_package_name"
        const val EXTRA_APP_ID = "uninstall_app_id"

        private val callbacks = mutableMapOf<String, JobCallback>()

        @Synchronized
        fun registerJob(jobId: String, callback: JobCallback) {
            callbacks[jobId] = callback
        }

        @Synchronized
        fun cancelJob(jobId: String) {
            callbacks.remove(jobId)
        }

        @Synchronized
        private fun takeCallback(jobId: String): JobCallback? = callbacks.remove(jobId)
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        val jobId = intent?.getStringExtra(EXTRA_JOB_ID) ?: return
        val callback = takeCallback(jobId)

        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context?.startActivity(confirmIntent)
                }
            }
            PackageInstaller.STATUS_SUCCESS -> callback?.onSuccess()
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                callback?.onFailure(message)
            }
        }
    }
}
