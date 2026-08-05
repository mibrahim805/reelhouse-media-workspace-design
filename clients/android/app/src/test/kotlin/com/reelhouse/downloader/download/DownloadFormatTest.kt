package com.reelhouse.downloader.download

import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadFormatTest {
    @Test
    fun audioUsesAnAudioContainerAndVideoUsesMp4() {
        assertEquals("m4a", outputFormatFor(audioOnly = true))
        assertEquals("mp4", outputFormatFor(audioOnly = false))
    }
}
