package com.reelhouse.downloader

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadFeatureFlagsTest {
    @Test
    fun formatExtractionCanBeDisabledWithoutDisablingLocalDownloadFallback() {
        assertFalse(BuildConfig.USE_LOCAL_FORMAT_EXTRACTION)
        assertTrue(BuildConfig.USE_LOCAL_DOWNLOAD_FALLBACK)
    }
}
