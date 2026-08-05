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
        val exactCombinedMp4 = safeHeight?.let {
            "best[height=$it][ext=mp4][vcodec!=none][acodec!=none]/"
        }.orEmpty()
        val exactCombinedWebm = safeHeight?.let {
            "best[height=$it][ext=webm][vcodec!=none][acodec!=none]/"
        }.orEmpty()
        val exactCombinedAny = safeHeight?.let {
            "best[height=$it][vcodec!=none][acodec!=none]/"
        }.orEmpty()
        return when (videoContainer.takeIf { it in setOf("mp4", "mkv", "webm") } ?: "mp4") {
            "webm" -> exactCombinedWebm +
                "bestvideo${heightFilter}[ext=webm]+bestaudio[ext=webm]/" +
                "best${heightFilter}[ext=webm]"
            "mkv" -> exactCombinedAny +
                "bestvideo${heightFilter}+bestaudio/" +
                "best${heightFilter}/best"
            else -> exactCombinedMp4 +
                "bestvideo${heightFilter}[ext=mp4]+bestaudio[ext=m4a]/" +
                "bestvideo${heightFilter}+bestaudio/" +
                "best${heightFilter}[ext=mp4]/" +
                "best${heightFilter}/best"
        }
    }

    fun safeAudioBitrate(audioBitrate: Int?): Int? =
        audioBitrate?.takeIf { it in allowedAudioBitrates }
}
