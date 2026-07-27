package com.reelhouse.downloader.media

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FormatInfo(
    @SerialName("format_id")
    val formatId: String = "",
    val ext: String = "",
    val resolution: String = "",
    val height: Int = 0,
    val width: Int = 0,
    val fps: Double = 0.0,
    val vcodec: String = "none",
    val acodec: String = "none",
    val abr: Double = 0.0,
    val filesize: Long = 0L,
    @SerialName("filesize_approx")
    val filesizeApprox: Long = 0L,
    @SerialName("format_note")
    val formatNote: String = "",
) {
    val isVideoOnly: Boolean get() = vcodec != "none" && acodec == "none"
    val isAudioOnly: Boolean get() = vcodec == "none" && acodec != "none"
    val hasVideo: Boolean get() = vcodec != "none"
    val hasAudio: Boolean get() = acodec != "none"

    val effectiveFilesize: Long get() = if (filesize > 0) filesize else filesizeApprox

    val filesizeFormatted: String
        get() {
            val size = effectiveFilesize
            if (size <= 0) return "Unknown size"
            val mb = size / (1024.0 * 1024.0)
            return if (mb >= 1024) {
                "%.1f GB".format(mb / 1024.0)
            } else {
                "%.1f MB".format(mb)
            }
        }

    val qualityLabel: String
        get() = when {
            hasVideo && height > 0 -> "${height}p"
            hasVideo -> resolution.ifBlank { "Video" }
            hasAudio && abr > 0 -> "${abr.toInt()} kbps"
            hasAudio -> "Audio"
            else -> formatNote.ifBlank { formatId }
        }
}
