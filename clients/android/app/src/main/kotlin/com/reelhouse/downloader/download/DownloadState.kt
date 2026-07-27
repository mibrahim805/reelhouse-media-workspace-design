package com.reelhouse.downloader.download

import com.reelhouse.downloader.media.MediaInfo

/**
 * Represents a download request with all parameters needed to execute it.
 */
data class DownloadRequest(
    val id: String,
    val url: String,
    val mediaInfo: MediaInfo,
    val formatSelector: String,
    val isAudioOnly: Boolean,
    val mergeFormat: String = if (isAudioOnly) "m4a" else "mp4",
    val qualityLabel: String = "",
    val destination: String = "downloads",
    val audioBitrate: Int? = null,
    val expectedBytes: Long = 0L,
)
