package com.reelhouse.downloader.media

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YtDlpUpdaterPolicyTest {
    @Test
    fun freshInstallChecksImmediately() {
        assertTrue(isEngineUpdateDue(nowMs = 10_000L, lastAttemptMs = 0L, lastSuccessMs = 0L))
    }

    @Test
    fun successfulCheckIsCachedForOneDay() {
        val hour = 60 * 60 * 1000L
        assertFalse(isEngineUpdateDue(2 * hour, hour, hour))
        assertTrue(isEngineUpdateDue(25 * hour, hour, hour))
    }

    @Test
    fun failedCheckRetriesAfterOneHour() {
        val hour = 60 * 60 * 1000L
        assertFalse(isEngineUpdateDue(hour + 1, hour, 0L))
        assertTrue(isEngineUpdateDue(2 * hour, hour, 0L))
    }
}
