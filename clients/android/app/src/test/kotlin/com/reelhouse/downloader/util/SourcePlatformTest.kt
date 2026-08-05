package com.reelhouse.downloader.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SourcePlatformTest {
    @Test
    fun detectsInstagramLinksWithoutFallingBackToYouTube() {
        val url = "https://www.instagram.com/reel/AbC123/?igsh=TrackingValue"

        assertFalse(SourcePlatform.isYouTube(url))
        assertEquals("Instagram", SourcePlatform.label(url))
    }

    @Test
    fun recognizesCommonYouTubeHosts() {
        assertTrue(SourcePlatform.isYouTube("https://youtu.be/dQw4w9WgXcQ"))
        assertTrue(SourcePlatform.isYouTube("https://m.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertEquals("YouTube", SourcePlatform.label("https://www.youtube.com/shorts/dQw4w9WgXcQ"))
    }

    @Test
    fun usesKnownSourceHostBeforeExtractorFallback() {
        assertEquals("TikTok", SourcePlatform.label("https://www.tiktok.com/@creator/video/123", "Generic"))
        assertEquals("Facebook", SourcePlatform.label("https://fb.watch/example/", "Generic"))
        assertEquals("Vimeo", SourcePlatform.label("https://example.com/video", "Vimeo:Review"))
    }
}
