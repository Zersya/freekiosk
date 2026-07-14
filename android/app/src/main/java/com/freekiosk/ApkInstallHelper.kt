package com.freekiosk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

data class ApkInstallJob(
    val id: String = UUID.randomUUID().toString(),
    val downloadUrl: String,
    val fileName: String,
    val expectedSha256: String?,
    val appId: Int?,
    val packageName: String?,
)

enum class ApkInstallStage {
    QUEUED,
    DOWNLOADING,
    INSTALLING,
    COMPLETED,
    FAILED,
}

class ApkInstallHelper private constructor(private val appContext: Context) {

    interface ProgressListener {
        fun onProgress(job: ApkInstallJob, stage: ApkInstallStage, message: String? = null)
        fun onComplete(job: ApkInstallJob)
        fun onError(job: ApkInstallJob, error: String)
    }

    companion object {
        private const val TAG = "ApkInstallHelper"
        private const val MIN_APK_BYTES = 50_000L

        @Volatile
        private var instance: ApkInstallHelper? = null

        fun getInstance(context: Context): ApkInstallHelper {
            return instance ?: synchronized(this) {
                instance ?: ApkInstallHelper(context.applicationContext).also { instance = it }
            }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .build()
    private val listeners = mutableSetOf<ProgressListener>()

    fun addListener(listener: ProgressListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: ProgressListener) {
        listeners.remove(listener)
    }

    fun enqueue(job: ApkInstallJob, waitForCompletion: Boolean = false, timeoutMs: Long = 120_000L): JSONObject {
        val resultRef = AtomicReference<JSONObject>()
        val latch = if (waitForCompletion) CountDownLatch(1) else null

        val wrappedListener = object : ProgressListener {
            override fun onProgress(job: ApkInstallJob, stage: ApkInstallStage, message: String?) {
                notifyProgress(job, stage, message)
            }

            override fun onComplete(job: ApkInstallJob) {
                notifyProgress(job, ApkInstallStage.COMPLETED, null)
                reportInstallStatus(job, "installed", null)
                if (waitForCompletion) {
                    resultRef.set(JSONObject().apply {
                        put("success", true)
                        put("status", "installed")
                        put("packageName", job.packageName)
                        put("appId", job.appId)
                    })
                    latch?.countDown()
                }
            }

            override fun onError(job: ApkInstallJob, error: String) {
                notifyError(job, error)
                reportInstallStatus(job, "failed", error)
                if (waitForCompletion) {
                    resultRef.set(JSONObject().apply {
                        put("success", false)
                        put("status", "failed")
                        put("error", error)
                        put("appId", job.appId)
                    })
                    latch?.countDown()
                }
            }
        }

        addListener(wrappedListener)
        executor.execute {
            try {
                processJob(job, wrappedListener)
            } finally {
                removeListener(wrappedListener)
            }
        }

        if (waitForCompletion) {
            val completed = latch?.await(timeoutMs, TimeUnit.MILLISECONDS) == true
            if (!completed) {
                return JSONObject().apply {
                    put("success", false)
                    put("status", "timeout")
                    put("error", "Install timed out")
                    put("appId", job.appId)
                }
            }
            return resultRef.get() ?: JSONObject().apply {
                put("success", false)
                put("status", "failed")
                put("error", "Install did not return a result")
            }
        }

        return JSONObject().apply {
            put("success", true)
            put("status", "queued")
            put("jobId", job.id)
            put("appId", job.appId)
        }
    }

    private fun processJob(job: ApkInstallJob, listener: ProgressListener) {
        listener.onProgress(job, ApkInstallStage.DOWNLOADING, "Downloading APK")
        reportInstallStatus(job, "downloading", null)

        val downloadsDir = appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: appContext.filesDir
        val safeName = job.fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val targetFile = File(downloadsDir, "mdm-${job.id}-$safeName")

        try {
            val request = Request.Builder()
                .url(job.downloadUrl)
                .header("Accept", "application/vnd.android.package-archive")
                .header("User-Agent", "FreeKiosk-ApkInstaller")
                .build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    listener.onError(job, "Download failed with HTTP ${response.code}")
                    return
                }

                val body = response.body ?: run {
                    listener.onError(job, "Download response body was empty")
                    return
                }

                body.byteStream().use { input ->
                    targetFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }

            if (!targetFile.exists() || targetFile.length() < MIN_APK_BYTES) {
                listener.onError(job, "Downloaded file is too small or missing")
                targetFile.delete()
                return
            }

            val sha256 = sha256OfFile(targetFile)
            if (!job.expectedSha256.isNullOrBlank() && !sha256.equals(job.expectedSha256, ignoreCase = true)) {
                listener.onError(job, "SHA-256 checksum mismatch")
                targetFile.delete()
                return
            }

            listener.onProgress(job, ApkInstallStage.INSTALLING, "Installing APK")
            reportInstallStatus(job, "installing", null)
            installFile(targetFile, job, listener)
        } catch (e: Exception) {
            Log.e(TAG, "Install job failed", e)
            listener.onError(job, e.message ?: "Install failed")
            targetFile.delete()
        }
    }

    private fun installFile(file: File, job: ApkInstallJob, listener: ProgressListener) {
        try {
            val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            if (dpm.isDeviceOwnerApp(appContext.packageName)) {
                val packageInstaller = appContext.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                val sessionId = packageInstaller.createSession(params)
                val session = packageInstaller.openSession(sessionId)

                session.openWrite("package", 0, file.length()).use { output ->
                    file.inputStream().use { input ->
                        input.copyTo(output)
                    }
                    session.fsync(output)
                }

                val intent = Intent(appContext, ApkInstallReceiver::class.java).apply {
                    putExtra(ApkInstallReceiver.EXTRA_JOB_ID, job.id)
                    putExtra(ApkInstallReceiver.EXTRA_APP_ID, job.appId ?: -1)
                    putExtra(ApkInstallReceiver.EXTRA_PACKAGE_NAME, job.packageName)
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    appContext,
                    job.id.hashCode(),
                    intent,
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                    } else {
                        PendingIntent.FLAG_UPDATE_CURRENT
                    },
                )

                ApkInstallReceiver.registerJob(job.id, object : ApkInstallReceiver.JobCallback {
                    override fun onSuccess() {
                        file.delete()
                        listener.onComplete(job)
                    }

                    override fun onFailure(message: String?) {
                        file.delete()
                        listener.onError(job, message ?: "Installation failed")
                    }
                })

                session.commit(pendingIntent.intentSender)
                session.close()
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Silent install failed, falling back to system installer", e)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !appContext.packageManager.canRequestPackageInstalls()
        ) {
            try {
                val settingsIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${appContext.packageName}"),
                )
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                appContext.startActivity(settingsIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Cannot open install permission settings", e)
            }
        }

        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            androidx.core.content.FileProvider.getUriForFile(
                appContext,
                "${appContext.packageName}.fileprovider",
                file,
            )
        } else {
            Uri.fromFile(file)
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        appContext.startActivity(intent)
        listener.onComplete(job)
    }

    private fun sha256OfFile(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var read = input.read(buffer)
            while (read > 0) {
                digest.update(buffer, 0, read)
                read = input.read(buffer)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun notifyProgress(job: ApkInstallJob, stage: ApkInstallStage, message: String?) {
        mainHandler.post {
            listeners.forEach { it.onProgress(job, stage, message) }
        }
    }

    private fun notifyError(job: ApkInstallJob, error: String) {
        mainHandler.post {
            listeners.forEach { it.onError(job, error) }
        }
    }

    private fun reportInstallStatus(job: ApkInstallJob, status: String, errorMessage: String?) {
        val appId = job.appId ?: return
        com.freekiosk.mdm.MdmInstallReporter.reportStatus(appContext, appId, status, errorMessage)
    }
}

class ApkInstallReceiver : BroadcastReceiver() {
    interface JobCallback {
        fun onSuccess()
        fun onFailure(message: String?)
    }

    companion object {
        const val EXTRA_JOB_ID = "job_id"
        const val EXTRA_APP_ID = "app_id"
        const val EXTRA_PACKAGE_NAME = "package_name"

        private val callbacks = mutableMapOf<String, JobCallback>()

        @Synchronized
        fun registerJob(jobId: String, callback: JobCallback) {
            callbacks[jobId] = callback
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
