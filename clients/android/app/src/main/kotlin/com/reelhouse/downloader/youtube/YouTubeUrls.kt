package com.reelhouse.downloader.youtube

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object YouTubeUrls {
    private val videoIdPattern = Regex("^[A-Za-z0-9_-]{11}$")

    fun videoId(value: String): String? {
        val uri = runCatching { URI(value.trim()) }.getOrNull() ?: return null
        if (!uri.scheme.equals("https", ignoreCase = true)) return null
        val host = uri.host?.lowercase()?.trimEnd('.') ?: return null
        val segments = uri.path.orEmpty().split('/').filter(String::isNotBlank)
        val candidate = when {
            host == "youtu.be" || host.endsWith(".youtu.be") -> segments.firstOrNull()
            host == "youtube.com" || host.endsWith(".youtube.com") -> when {
                uri.path == "/watch" -> queryParameter(uri.rawQuery, "v")
                segments.firstOrNull() in setOf("shorts", "live", "embed") -> segments.getOrNull(1)
                else -> null
            }
            else -> null
        }
        return candidate?.takeIf(videoIdPattern::matches)
    }

    fun watchUrl(id: String): String? =
        id.takeIf(videoIdPattern::matches)?.let { "https://www.youtube.com/watch?v=$it" }

    fun embedUrl(id: String): String? =
        id.takeIf(videoIdPattern::matches)?.let {
            "https://www.youtube.com/embed/$it?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1"
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
