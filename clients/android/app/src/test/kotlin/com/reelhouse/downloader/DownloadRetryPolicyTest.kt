package com.reelhouse.downloader

import com.reelhouse.downloader.data.DownloadEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadRetryPolicyTest {
    @Test
    fun finishedJobsAllowANewPreparedDownload() {
        assertTrue(DownloadRetryPolicy.isFinished(DownloadEntity.Status.FAILED))
        assertTrue(DownloadRetryPolicy.isFinished(DownloadEntity.Status.CANCELLED))
        assertTrue(DownloadRetryPolicy.isFinished(DownloadEntity.Status.COMPLETE))
    }

    @Test
    fun activeJobsRemainDeduplicated() {
        assertFalse(DownloadRetryPolicy.isFinished(DownloadEntity.Status.QUEUED))
        assertFalse(DownloadRetryPolicy.isFinished(DownloadEntity.Status.DOWNLOADING))
        assertFalse(DownloadRetryPolicy.isFinished(DownloadEntity.Status.PROCESSING))
    }
}
