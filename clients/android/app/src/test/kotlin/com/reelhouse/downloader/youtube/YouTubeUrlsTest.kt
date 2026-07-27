package com.reelhouse.downloader.youtube

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YouTubeUrlsTest {
    @Test fun readsIdsFromWebsiteSupportedYouTubeLinks() {
        val id = "dQw4w9WgXcQ"
        assertEquals(id, YouTubeUrls.videoId("https://www.youtube.com/watch?v=$id"))
        assertEquals(id, YouTubeUrls.videoId("https://youtu.be/$id?t=10"))
        assertEquals(id, YouTubeUrls.videoId("https://m.youtube.com/shorts/$id"))
        assertEquals(id, YouTubeUrls.videoId("https://www.youtube.com/live/$id"))
        assertEquals(id, YouTubeUrls.videoId("https://www.youtube.com/embed/$id"))
    }

    @Test fun rejectsUntrustedOrInvalidLinks() {
        assertNull(YouTubeUrls.videoId("http://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertNull(YouTubeUrls.videoId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"))
        assertNull(YouTubeUrls.videoId("https://www.youtube.com/watch?v=short"))
        assertNull(YouTubeUrls.videoId("https://example.com/watch?v=dQw4w9WgXcQ"))
    }

    @Test fun createsCanonicalWatchAndEmbedUrls() {
        val id = "dQw4w9WgXcQ"
        assertEquals("https://www.youtube.com/watch?v=$id", YouTubeUrls.watchUrl(id))
        assertEquals(
            "https://www.youtube.com/embed/$id?autoplay=1&playsinline=1&rel=0",
            YouTubeUrls.embedUrl(id),
        )
        assertNull(YouTubeUrls.embedUrl("invalid"))
    }
}
