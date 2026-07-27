package com.reelhouse.downloader.youtube

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Keeps the in-app browser on YouTube and converts supported watch URLs into
 * the canonical URL consumed by the existing local download flow.
 */
object YouTubeUrlPolicy {
    const val HOME_URL = "https://m.youtube.com/"

    private val videoIdPattern = Regex("^[A-Za-z0-9_-]{11}$")

    fun isInternalUrl(value: String): Boolean {
        val uri = parse(value) ?: return false
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        return isYouTubeHost(uri.host)
    }

    fun canonicalVideoUrl(value: String): String? {
        val uri = parse(value) ?: return null
        if (!uri.scheme.equals("https", ignoreCase = true)) return null

        val host = uri.host?.lowercase()?.trimEnd('.') ?: return null
        val segments = uri.path.orEmpty()
            .split('/')
            .filter { it.isNotBlank() }

        val candidate = when {
            host == "youtu.be" || host.endsWith(".youtu.be") ->
                segments.firstOrNull()

            host == "youtube.com" || host.endsWith(".youtube.com") -> when {
                uri.path == "/watch" -> queryParameter(uri.rawQuery, "v")
                segments.firstOrNull() in setOf("shorts", "live", "embed") ->
                    segments.getOrNull(1)
                else -> null
            }

            else -> null
        }

        return candidate
            ?.takeIf(videoIdPattern::matches)
            ?.let { "https://www.youtube.com/watch?v=$it" }
    }

    private fun parse(value: String): URI? =
        runCatching { URI(value.trim()) }.getOrNull()

    private fun isYouTubeHost(hostValue: String?): Boolean {
        val host = hostValue?.lowercase()?.trimEnd('.') ?: return false
        return host == "youtu.be" ||
            host.endsWith(".youtu.be") ||
            host == "youtube.com" ||
            host.endsWith(".youtube.com")
    }

    private fun queryParameter(rawQuery: String?, name: String): String? =
        rawQuery
            ?.split('&')
            ?.asSequence()
            ?.map { it.split('=', limit = 2) }
            ?.firstOrNull { parts ->
                URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name()) == name
            }
            ?.getOrNull(1)
            ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
}
