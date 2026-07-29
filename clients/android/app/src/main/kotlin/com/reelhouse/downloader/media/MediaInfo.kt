package com.reelhouse.downloader.media

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MediaInfo(
    val id: String = "",
    val title: String = "Untitled",
    val uploader: String = "",
    val channel: String = "",
    val duration: Long = 0L,
    val thumbnail: String = "",
    val platform: String = "",
    @SerialName("webpage_url")
    val webpageUrl: String = "",
    val formats: List<FormatInfo> = emptyList(),
) {
    val displayUploader: String
        get() = uploader.ifBlank { channel.ifBlank { "Unknown" } }

    val durationFormatted: String
        get() {
            if (duration <= 0) return "Unknown"
            val hours = duration / 3600
            val minutes = (duration % 3600) / 60
            val seconds = duration % 60
            return if (hours > 0) {
                "%d:%02d:%02d".format(hours, minutes, seconds)
            } else {
                "%d:%02d".format(minutes, seconds)
            }
        }
    }

data class PlaylistInfo(
    val id: String = "",
    val title: String = "Untitled playlist",
    val uploader: String = "",
    val channel: String = "",
    val thumbnail: String = "",
    val videoCount: Int = 0,
    val webpageUrl: String = "",
) {
    val displayUploader: String
        get() = uploader.ifBlank { channel.ifBlank { "Unknown" } }
}
