package com.reelhouse.downloader.youtube

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YouTubeUrlPolicyTest {
    @Test fun keepsOnlyYouTubeWebPagesInsideTheApp() {
        assertTrue(YouTubeUrlPolicy.isInternalUrl("https://m.youtube.com/"))
        assertTrue(YouTubeUrlPolicy.isInternalUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertTrue(YouTubeUrlPolicy.isInternalUrl("https://youtu.be/dQw4w9WgXcQ"))

        assertFalse(YouTubeUrlPolicy.isInternalUrl("https://example.com/youtube.com"))
        assertFalse(YouTubeUrlPolicy.isInternalUrl("http://m.youtube.com/"))
        assertFalse(YouTubeUrlPolicy.isInternalUrl("m.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertFalse(YouTubeUrlPolicy.isInternalUrl("javascript:alert(1)"))
        assertFalse(YouTubeUrlPolicy.isInternalUrl("https://youtube.com.evil.example/watch"))
    }

    @Test fun convertsSupportedYouTubeVideoLinksForTheDownloader() {
        val expected = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assertEquals(expected, YouTubeUrlPolicy.canonicalVideoUrl(expected))
        assertEquals(expected, YouTubeUrlPolicy.canonicalVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=10"))
        assertEquals(expected, YouTubeUrlPolicy.canonicalVideoUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals(expected, YouTubeUrlPolicy.canonicalVideoUrl("https://www.youtube.com/live/dQw4w9WgXcQ"))
        assertEquals(expected, YouTubeUrlPolicy.canonicalVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"))
    }

    @Test fun rejectsChannelsSearchPagesAndInvalidVideoIds() {
        assertNull(YouTubeUrlPolicy.canonicalVideoUrl("https://m.youtube.com/"))
        assertNull(YouTubeUrlPolicy.canonicalVideoUrl("https://www.youtube.com/results?search_query=music"))
        assertNull(YouTubeUrlPolicy.canonicalVideoUrl("https://www.youtube.com/watch?v=too-short"))
        assertNull(YouTubeUrlPolicy.canonicalVideoUrl("http://youtu.be/dQw4w9WgXcQ"))
        assertNull(YouTubeUrlPolicy.canonicalVideoUrl("https://example.com/watch?v=dQw4w9WgXcQ"))
    }
}
