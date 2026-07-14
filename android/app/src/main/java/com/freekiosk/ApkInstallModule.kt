package com.freekiosk

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ApkInstallModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ApkInstallHelper.ProgressListener {

    companion object {
        private const val NAME = "ApkInstallModule"
        const val EVENT_PROGRESS = "onApkInstallProgress"
        const val EVENT_COMPLETE = "onApkInstallComplete"
        const val EVENT_ERROR = "onApkInstallError"
    }

    private val helper = ApkInstallHelper.getInstance(reactContext)

    init {
        helper.addListener(this)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun downloadAndInstall(
        downloadUrl: String,
        fileName: String,
        sha256: String?,
        appId: Int?,
        packageName: String?,
        displayName: String?,
        promise: Promise,
    ) {
        try {
            if (downloadUrl.isBlank()) {
                promise.reject("INVALID_URL", "Download URL is required")
                return
            }

            val job = ApkInstallJob(
                downloadUrl = downloadUrl,
                fileName = if (fileName.isBlank()) "app.apk" else fileName,
                expectedSha256 = sha256?.takeIf { it.isNotBlank() },
                appId = appId?.takeIf { it > 0 },
                packageName = packageName?.takeIf { it.isNotBlank() },
                displayName = displayName?.takeIf { it.isNotBlank() },
            )

            val result = helper.enqueue(job, waitForCompletion = false)
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onProgress(job: ApkInstallJob, stage: ApkInstallStage, message: String?) {
        sendEvent(EVENT_PROGRESS, Arguments.createMap().apply {
            putString("jobId", job.id)
            putInt("appId", job.appId ?: -1)
            putString("packageName", job.packageName)
            putString("stage", stage.name.lowercase())
            putString("message", message)
        })
    }

    override fun onComplete(job: ApkInstallJob) {
        sendEvent(EVENT_COMPLETE, Arguments.createMap().apply {
            putString("jobId", job.id)
            putInt("appId", job.appId ?: -1)
            putString("packageName", job.packageName)
            putString("displayName", job.displayName)
            putBoolean("addedToHomeScreen", !job.packageName.isNullOrBlank())
        })
    }

    override fun onError(job: ApkInstallJob, error: String) {
        sendEvent(EVENT_ERROR, Arguments.createMap().apply {
            putString("jobId", job.id)
            putInt("appId", job.appId ?: -1)
            putString("packageName", job.packageName)
            putString("error", error)
        })
    }

    private fun sendEvent(event: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }
}
