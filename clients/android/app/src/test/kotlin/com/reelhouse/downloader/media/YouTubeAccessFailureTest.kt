package com.reelhouse.downloader.media

import org.junit.Assert.assertTrue
import org.junit.Test

class YouTubeAccessFailureTest {
    @Test
    fun error152IsTreatedAsClientAccessFailureForRetry() {
        val message = "ERROR: [youtube] id: This video is unavailable. Error code: 152 - 18 Watch video on YouTube"
        assertTrue(isYouTubeClientAccessFailure(message))
    }
}
