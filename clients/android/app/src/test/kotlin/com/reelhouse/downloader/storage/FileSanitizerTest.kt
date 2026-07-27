package com.reelhouse.downloader.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FileSanitizerTest {
    @Test fun removesTraversalAndIllegalCharacters() {
        val result = FileSanitizer.sanitize("../../my:video?.mp4")
        assertFalse(result.contains(".."))
        assertFalse(result.contains('/'))
        assertFalse(result.contains(':'))
        assertTrue(result.endsWith(".mp4"))
    }

    @Test fun makesDuplicateNamesUnique() {
        assertEquals("video (2).mp4", FileSanitizer.makeUnique("video.mp4", setOf("video.mp4", "video (1).mp4")))
    }
}
