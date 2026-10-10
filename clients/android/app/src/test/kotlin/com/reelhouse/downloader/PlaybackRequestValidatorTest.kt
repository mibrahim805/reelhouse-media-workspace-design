package com.reelhouse.downloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackRequestValidatorTest {
    @Test fun acceptsHttpsSourceAndRejectsCredentials() {
        assertEquals("https://example.com/video.mp4", PlaybackRequestValidator.onlineSource("https://example.com/video.mp4"))
        assertNull(PlaybackRequestValidator.onlineSource("https://user:secret@example.com/video.mp4"))
        assertNull(PlaybackRequestValidator.onlineSource("file:///sdcard/video.mp4"))
    }

    @Test fun localPlaybackOnlyAcceptsAndroidUriSchemes() {
        assertEquals("content", PlaybackRequestValidator.localScheme("content://media/external/video/media/1"))
        assertNull(PlaybackRequestValidator.localScheme("https://example.com/video"))
    }

    @Test fun keysCannotContainControlCharacters() {
        assertEquals("local-video:abc-123", PlaybackRequestValidator.key("local-video:abc-123"))
        assertNull(PlaybackRequestValidator.key("local-video:abc 123"))
    }
}
