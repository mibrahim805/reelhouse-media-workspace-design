package com.reelhouse.downloader.download

import com.reelhouse.downloader.data.DownloadEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadRecoveryTest {
    @Test
    fun persistedDownloadRetainsEverythingRequiredForBackgroundResume() {
        val entity = DownloadEntity(
            id = "job-1",
            url = "https://www.youtube.com/watch?v=abcdefghijk",
            sourceId = "abcdefghijk",
            title = "Example",
            thumbnail = "https://i.ytimg.com/example.jpg",
            platform = "Youtube",
            uploader = "Channel",
            formatLabel = "Up to 720p",
            formatSelector = "bestvideo[height<=720]+bestaudio/best[height<=720]",
            fileExtension = "mp4",
            status = DownloadEntity.Status.DOWNLOADING,
            totalBytes = 1234L,
            destination = "downloads",
        )

        val recovered = entity.toDownloadRequest()

        assertEquals(entity.id, recovered.id)
        assertEquals(entity.url, recovered.url)
        assertEquals(entity.sourceId, recovered.mediaInfo.id)
        assertEquals(entity.title, recovered.mediaInfo.title)
        assertEquals(entity.formatSelector, recovered.formatSelector)
        assertEquals(entity.formatLabel, recovered.qualityLabel)
        assertEquals(entity.fileExtension, recovered.mergeFormat)
        assertEquals(entity.totalBytes, recovered.expectedBytes)
    }
}
