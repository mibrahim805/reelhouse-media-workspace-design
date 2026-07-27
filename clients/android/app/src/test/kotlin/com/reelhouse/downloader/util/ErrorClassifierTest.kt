package com.reelhouse.downloader.util

import org.junit.Assert.assertEquals
import org.junit.Test

class ErrorClassifierTest {
    @Test fun classifiesCommonSourceFailures() {
        assertEquals(ErrorClassifier.ErrorType.FORBIDDEN, ErrorClassifier.classify("HTTP Error 403: Forbidden"))
        assertEquals(ErrorClassifier.ErrorType.RATE_LIMITED, ErrorClassifier.classify("HTTP Error 429: Too Many Requests"))
        assertEquals(ErrorClassifier.ErrorType.AUTH_REQUIRED, ErrorClassifier.classify("Sign in to confirm your age"))
        assertEquals(ErrorClassifier.ErrorType.FFMPEG_FAILED, ErrorClassifier.classify("ffmpeg merge failed"))
        assertEquals(ErrorClassifier.ErrorType.STORAGE_FAILED, ErrorClassifier.classify("MediaStore file could not be published"))
    }
}
