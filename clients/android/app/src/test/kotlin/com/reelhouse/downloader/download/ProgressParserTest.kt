package com.reelhouse.downloader.download

import org.junit.Assert.assertEquals
import org.junit.Test

class ProgressParserTest {
    @Test fun parsesYtDlpProgressLine() {
        val result = ProgressParser.parse("[download]  25.0% of 10.00MiB at 2.00MiB/s ETA 00:03", 25f)
        assertEquals(10L * 1024 * 1024, result.totalBytes)
        assertEquals(2L * 1024 * 1024, result.speedBytesPerSecond)
        assertEquals(2_621_440L, result.downloadedBytes)
    }
}
