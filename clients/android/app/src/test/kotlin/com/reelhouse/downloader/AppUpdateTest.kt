package com.reelhouse.downloader

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateTest {
    @Test
    fun newerVersionIsAvailable() {
        assertTrue(isNewerAppVersion(40, 39))
    }

    @Test
    fun sameOrOlderVersionIsNotAvailable() {
        assertFalse(isNewerAppVersion(39, 39))
        assertFalse(isNewerAppVersion(38, 39))
    }
}
