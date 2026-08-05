package com.reelhouse.downloader.util

import java.net.URI

/** Pure URL-based source detection used when extractor metadata is absent. */
object SourcePlatform {
    fun isYouTube(url: String): Boolean {
        val host = host(url)
        return host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
    }

    fun label(url: String, extractor: String = ""): String {
        val host = host(url)
        return when {
            host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com") -> "YouTube"
            host == "instagram.com" || host.endsWith(".instagram.com") -> "Instagram"
            host == "tiktok.com" || host.endsWith(".tiktok.com") -> "TikTok"
            host == "facebook.com" || host.endsWith(".facebook.com") || host == "fb.watch" -> "Facebook"
            extractor.isNotBlank() -> extractor.substringBefore(':').trim()
            host.isNotBlank() -> host.removePrefix("www.")
            else -> "Video"
        }
    }

    private fun host(url: String): String = runCatching {
        URI(url.trim()).host.orEmpty().lowercase()
    }.getOrDefault("")
}
