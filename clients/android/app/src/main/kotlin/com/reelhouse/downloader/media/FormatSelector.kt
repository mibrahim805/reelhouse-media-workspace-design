package com.reelhouse.downloader.media

object FormatSelector {
    private val allowedAudioBitrates = setOf(64, 96, 128, 160, 192, 256, 320)

    fun build(
        audioOnly: Boolean,
        videoHeight: Int?,
        audioBitrate: Int? = null,
        videoContainer: String = "mp4",
    ): String {
        if (audioOnly) {
            val safeBitrate = audioBitrate?.takeIf { it in allowedAudioBitrates }
            return safeBitrate?.let { "bestaudio[abr<=$it]/bestaudio/best" }
                ?: "bestaudio/best"
        }
        val safeHeight = videoHeight?.takeIf { it in 144..4320 }
        val heightFilter = safeHeight?.let { "[height<=$it]" }.orEmpty()
        return when (videoContainer.takeIf { it in setOf("mp4", "mkv", "webm") } ?: "mp4") {
            "webm" -> "bestvideo${heightFilter}[ext=webm]+bestaudio[ext=webm]/" +
                "best${heightFilter}[ext=webm]"
            "mkv" -> "bestvideo${heightFilter}+bestaudio/" +
                "best${heightFilter}/best"
            else -> "bestvideo${heightFilter}[ext=mp4]+bestaudio[ext=m4a]/" +
                "bestvideo${heightFilter}+bestaudio/" +
                "best${heightFilter}[ext=mp4]/" +
                "best${heightFilter}/best"
        }
    }

    fun safeAudioBitrate(audioBitrate: Int?): Int? =
        audioBitrate?.takeIf { it in allowedAudioBitrates }
}
