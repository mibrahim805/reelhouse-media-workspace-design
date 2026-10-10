package com.reelhouse.downloader

import android.net.Uri
import java.net.URI

/** Small, side-effect-free validation used at the WebView/native boundary. */
object PlaybackRequestValidator {
    fun onlineSource(value: String): String? {
        val trimmed = value.trim()
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null) return null
        return trimmed.takeIf { it.length <= MAX_SOURCE_LENGTH }
    }

    fun localUri(value: String): Uri? {
        val trimmed = value.trim()
        if (localScheme(trimmed) == null) return null
        return runCatching { Uri.parse(trimmed) }.getOrNull()
    }

    fun localScheme(value: String): String? = runCatching { URI(value.trim()).scheme?.lowercase() }
        .getOrNull()
        ?.takeIf { it == "content" || it == "file" }

    fun key(value: String): String? = value.trim()
        .takeIf { it.isNotBlank() && it.length <= MAX_KEY_LENGTH && KEY_PATTERN.matches(it) }

    private const val MAX_SOURCE_LENGTH = 4_096
    private const val MAX_KEY_LENGTH = 256
    private val KEY_PATTERN = Regex("[A-Za-z0-9:_./-]+")
}
