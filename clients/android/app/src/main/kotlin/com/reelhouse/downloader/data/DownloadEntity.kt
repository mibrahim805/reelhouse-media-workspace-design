package com.reelhouse.downloader.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val id: String,
    val url: String,
    val sourceId: String = "",
    val title: String,
    val thumbnail: String = "",
    val platform: String = "",
    val uploader: String = "",
    val formatLabel: String = "",
    val formatSelector: String = "best",
    val fileExtension: String = "mp4",
    val status: String = Status.QUEUED,
    val progress: Float = 0f,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val speedBytesPerSec: Long = 0L,
    val etaSeconds: Long = 0L,
    val filePath: String? = null,
    val contentUri: String? = null,
    val mimeType: String = "video/mp4",
    val fileSizeBytes: Long = 0L,
    val savedDisplayName: String = "",
    val savedLocation: String = "",
    val errorMessage: String? = null,
    val errorType: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null,
    val isAudioOnly: Boolean = false,
    val destination: String = "downloads",
    val audioBitrate: Int? = null,
) {
    object Status {
        const val QUEUED = "queued"
        const val DOWNLOADING = "downloading"
        const val PROCESSING = "processing"
        const val COMPLETE = "complete"
        const val FAILED = "failed"
        const val CANCELLED = "cancelled"
    }

    val isActive: Boolean
        get() = status in setOf(Status.QUEUED, Status.DOWNLOADING, Status.PROCESSING)

    val isFinished: Boolean
        get() = status in setOf(Status.COMPLETE, Status.FAILED, Status.CANCELLED)

    val speedFormatted: String
        get() {
            if (speedBytesPerSec <= 0) return ""
            val kbps = speedBytesPerSec / 1024.0
            return if (kbps >= 1024) {
                "%.1f MB/s".format(kbps / 1024.0)
            } else {
                "%.0f KB/s".format(kbps)
            }
        }

    val etaFormatted: String
        get() {
            if (etaSeconds <= 0) return ""
            val mins = etaSeconds / 60
            val secs = etaSeconds % 60
            return if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
        }

    val downloadedFormatted: String
        get() = formatBytes(downloadedBytes)

    val totalFormatted: String
        get() = if (totalBytes > 0) formatBytes(totalBytes) else ""

    val fileSizeFormatted: String
        get() = if (fileSizeBytes > 0) formatBytes(fileSizeBytes) else ""

    private fun formatBytes(bytes: Long): String {
        val mb = bytes / (1024.0 * 1024.0)
        return if (mb >= 1024) {
            "%.1f GB".format(mb / 1024.0)
        } else if (mb >= 1) {
            "%.1f MB".format(mb)
        } else {
            "%.0f KB".format(bytes / 1024.0)
        }
    }
}
