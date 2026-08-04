package com.reelhouse.downloader

import com.reelhouse.downloader.data.DownloadEntity

internal object DownloadRetryPolicy {
    fun isFinished(status: String): Boolean = status in setOf(
        DownloadEntity.Status.COMPLETE,
        DownloadEntity.Status.FAILED,
        DownloadEntity.Status.CANCELLED,
    )
}
