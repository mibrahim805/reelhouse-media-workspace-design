package com.reelhouse.downloader.download

import com.reelhouse.downloader.data.DownloadEntity
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

internal fun outputFormatFor(audioOnly: Boolean): String = if (audioOnly) "m4a" else "mp4"

internal fun DownloadEntity.toDownloadRequest(): DownloadRequest = DownloadRequest(
    id = id,
    url = url,
    mediaInfo = MediaInfo(
        id = sourceId,
        title = title,
        uploader = uploader,
        thumbnail = thumbnail,
        platform = platform,
        webpageUrl = url,
    ),
    formatSelector = formatSelector,
    isAudioOnly = isAudioOnly,
    mergeFormat = fileExtension,
    qualityLabel = formatLabel,
    destination = destination,
    audioBitrate = audioBitrate,
    expectedBytes = totalBytes,
)
