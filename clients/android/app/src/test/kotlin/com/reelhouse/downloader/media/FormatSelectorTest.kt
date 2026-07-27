package com.reelhouse.downloader.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatSelectorTest {
    @Test fun buildsWhitelistedVideoSelector() {
        val selector = FormatSelector.build(audioOnly = false, videoHeight = 720)
        assertTrue(selector.contains("height<=720"))
        assertFalse(selector.contains(';'))
    }

    @Test fun audioUsesBestAudioWithoutUserFlags() {
        assertEquals("bestaudio/best", FormatSelector.build(audioOnly = true, videoHeight = 720))
    }

    @Test fun audioBitrateComesOnlyFromTheInternalWhitelist() {
        assertEquals(
            "bestaudio[abr<=192]/bestaudio/best",
            FormatSelector.build(audioOnly = true, videoHeight = null, audioBitrate = 192),
        )
        assertEquals(
            "bestaudio/best",
            FormatSelector.build(audioOnly = true, videoHeight = null, audioBitrate = 123),
        )
    }

    @Test fun invalidVideoHeightCannotBecomeAnArgument() {
        val selector = FormatSelector.build(audioOnly = false, videoHeight = 99_999)
        assertFalse(selector.contains("99999"))
        assertFalse(selector.contains(';'))
    }

    @Test fun videoContainerUsesOnlyCompatibleWhitelistedSelectors() {
        val webm = FormatSelector.build(
            audioOnly = false,
            videoHeight = 1080,
            videoContainer = "webm",
        )
        assertTrue(webm.contains("[ext=webm]"))
        assertFalse(webm.contains("[ext=mp4]"))

        val unknown = FormatSelector.build(
            audioOnly = false,
            videoHeight = 720,
            videoContainer = "mp4;rm -rf",
        )
        assertTrue(unknown.contains("[ext=mp4]"))
        assertFalse(unknown.contains(';'))
    }
}
