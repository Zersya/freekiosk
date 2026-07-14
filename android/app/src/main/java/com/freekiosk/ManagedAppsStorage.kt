package com.freekiosk

import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists MDM-installed apps into the kiosk managed-apps list (AsyncStorage / RKStorage)
 * so they appear on the multi-app home screen and lock-task whitelist.
 */
object ManagedAppsStorage {
    private const val TAG = "ManagedAppsStorage"
    private const val KEY_MANAGED_APPS = "@kiosk_managed_apps"
    private const val KEY_DISPLAY_MODE = "@kiosk_display_mode"
    private const val KEY_EXTERNAL_APP_MODE = "@kiosk_external_app_mode"

    fun registerInstalledApp(context: Context, packageName: String?, displayName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false

        val pm = context.packageManager
        val resolvedLabel = try {
            val appInfo = pm.getApplicationInfo(packageName, 0)
            when {
                !displayName.isNullOrBlank() -> displayName
                else -> pm.getApplicationLabel(appInfo).toString()
            }
        } catch (e: PackageManager.NameNotFoundException) {
            Log.w(TAG, "Package not found after install: $packageName")
            displayName ?: packageName
        }

        val db = openDb(context) ?: return false
        return try {
            val apps = readManagedApps(db)
            val updated = upsertApp(apps, packageName, resolvedLabel)
            writeManagedApps(db, updated)
            ensureMultiAppKioskMode(db)
            refreshLockTaskWhitelist(context)
            Log.i(TAG, "Registered $packageName on home screen as $resolvedLabel")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register managed app", e)
            false
        } finally {
            db.close()
        }
    }

    private fun openDb(context: Context): SQLiteDatabase? {
        return try {
            val dbPath = context.getDatabasePath("RKStorage").absolutePath
            val dbFile = java.io.File(dbPath)
            dbFile.parentFile?.mkdirs()
            val db = SQLiteDatabase.openOrCreateDatabase(dbPath, null)
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS catalystLocalStorage (
                  `key` TEXT NOT NULL,
                  `value` TEXT,
                  PRIMARY KEY(`key`)
                )
                """.trimIndent(),
            )
            db
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open AsyncStorage DB", e)
            null
        }
    }

    private fun readValue(db: SQLiteDatabase, key: String): String? {
        db.rawQuery(
            "SELECT value FROM catalystLocalStorage WHERE key = ?",
            arrayOf(key),
        ).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }

    private fun writeValue(db: SQLiteDatabase, key: String, value: String) {
        val contentValues = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        db.insertWithOnConflict("catalystLocalStorage", null, contentValues, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun readManagedApps(db: SQLiteDatabase): JSONArray {
        val raw = readValue(db, KEY_MANAGED_APPS) ?: "[]"
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    private fun writeManagedApps(db: SQLiteDatabase, apps: JSONArray) {
        writeValue(db, KEY_MANAGED_APPS, apps.toString())
    }

    private fun upsertApp(apps: JSONArray, packageName: String, displayName: String): JSONArray {
        val result = JSONArray()
        var replaced = false
        for (i in 0 until apps.length()) {
            val existing = apps.getJSONObject(i)
            if (existing.optString("packageName") == packageName) {
                result.put(buildAppJson(packageName, displayName, existing))
                replaced = true
            } else {
                result.put(existing)
            }
        }
        if (!replaced) {
            result.put(buildAppJson(packageName, displayName, null))
        }
        return result
    }

    private fun buildAppJson(packageName: String, displayName: String, existing: JSONObject?): JSONObject {
        return JSONObject().apply {
            put("packageName", packageName)
            put("displayName", displayName)
            put("showOnHomeScreen", existing?.optBoolean("showOnHomeScreen", true) ?: true)
            put("launchOnBoot", existing?.optBoolean("launchOnBoot", false) ?: false)
            put("keepAlive", existing?.optBoolean("keepAlive", false) ?: false)
            put("allowAccessibility", existing?.optBoolean("allowAccessibility", false) ?: false)
        }
    }

    private fun ensureMultiAppKioskMode(db: SQLiteDatabase) {
        val displayMode = readValue(db, KEY_DISPLAY_MODE)
        if (displayMode.isNullOrBlank() || displayMode == "webview" || displayMode == "media_player") {
            writeValue(db, KEY_DISPLAY_MODE, "external_app")
        }
        val externalMode = readValue(db, KEY_EXTERNAL_APP_MODE)
        if (externalMode != "multi") {
            writeValue(db, KEY_EXTERNAL_APP_MODE, "multi")
        }
    }

    private fun refreshLockTaskWhitelist(context: Context) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(context.packageName)) return

            val adminComponent = ComponentName(context, DeviceAdminReceiver::class.java)
            val whitelist = mutableListOf(context.packageName)
            whitelist.addAll(readInstalledManagedPackages(context))
            dpm.setLockTaskPackages(adminComponent, whitelist.distinct().toTypedArray())
            Log.i(TAG, "Lock task whitelist refreshed: ${whitelist.distinct()}")
        } catch (e: Exception) {
            Log.w(TAG, "Could not refresh lock task whitelist: ${e.message}")
        }
    }

    private fun readInstalledManagedPackages(context: Context): List<String> {
        val db = openDb(context) ?: return emptyList()
        return try {
            val apps = readManagedApps(db)
            val pm = context.packageManager
            val packages = mutableListOf<String>()
            for (i in 0 until apps.length()) {
                val pkg = apps.getJSONObject(i).optString("packageName")
                if (pkg.isBlank()) continue
                try {
                    pm.getPackageInfo(pkg, 0)
                    packages.add(pkg)
                } catch (_: PackageManager.NameNotFoundException) {
                    // skip apps that are not installed yet
                }
            }
            packages
        } finally {
            db.close()
        }
    }
}
