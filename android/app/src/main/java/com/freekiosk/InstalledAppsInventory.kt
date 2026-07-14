package com.freekiosk

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Snapshot of user-relevant packages on the device for MDM inventory.
 */
object InstalledAppsInventory {
    private const val TAG = "InstalledAppsInventory"

    fun snapshot(context: Context): JSONArray {
        val pm = context.packageManager
        val result = JSONArray()

        val apps = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getInstalledApplications(
                    PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()),
                )
            } else {
                @Suppress("DEPRECATION")
                pm.getInstalledApplications(PackageManager.GET_META_DATA)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to list installed applications: ${e.message}")
            return result
        }

        for (appInfo in apps) {
            if (!shouldReport(appInfo)) continue

            try {
                val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.getPackageInfo(
                        appInfo.packageName,
                        PackageManager.PackageInfoFlags.of(0),
                    )
                } else {
                    @Suppress("DEPRECATION")
                    pm.getPackageInfo(appInfo.packageName, 0)
                }

                val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkgInfo.longVersionCode
                } else {
                    @Suppress("DEPRECATION")
                    pkgInfo.versionCode.toLong()
                }

                result.put(
                    JSONObject().apply {
                        put("packageName", appInfo.packageName)
                        put("versionCode", versionCode)
                        put("versionName", pkgInfo.versionName ?: "")
                    },
                )
            } catch (e: Exception) {
                Log.w(TAG, "Skipping package ${appInfo.packageName}: ${e.message}")
            }
        }

        return result
    }

    private fun shouldReport(appInfo: ApplicationInfo): Boolean {
        val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val isUpdatedSystem = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        return !isSystem || isUpdatedSystem
    }
}
