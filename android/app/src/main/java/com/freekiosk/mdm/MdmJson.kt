package com.freekiosk.mdm

import org.json.JSONObject

fun JSONObject.optAppId(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return when (val raw = opt(key)) {
        is String -> raw.trim().takeIf { it.isNotEmpty() }
        is Number -> {
            val value = raw.toLong()
            if (value > 0L) value.toString() else null
        }
        else -> optString(key, "").trim().takeIf { it.isNotEmpty() }
    }
}
