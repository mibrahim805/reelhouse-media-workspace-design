package com.reelhouse.downloader.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlValidatorTest {
    @Test fun acceptsPublicHttpsUrl() {
        assertTrue(UrlValidator.validateSyntax("https://example.com/video") is UrlValidator.ValidationResult.Valid)
    }

    @Test fun extractsUrlFromSharedAppText() {
        val shared = "Watch this clip on TikTok https://vm.tiktok.com/ZMexample/ Enjoy!"

        assertEquals(
            "https://vm.tiktok.com/ZMexample/",
            UrlValidator.extractHttpUrl(shared),
        )
        val validated = UrlValidator.validateSyntax(shared)
        assertTrue(validated is UrlValidator.ValidationResult.Valid)
        assertEquals(
            "https://vm.tiktok.com/ZMexample/",
            (validated as UrlValidator.ValidationResult.Valid).url,
        )
    }

    @Test fun rejectsDangerousSchemesAndCredentials() {
        listOf(
            "file:///etc/passwd",
            "content://media/1",
            "javascript:alert(1)",
            "https://user:secret@example.com/video",
        ).forEach { assertTrue(UrlValidator.validateSyntax(it) is UrlValidator.ValidationResult.Invalid) }
    }

    @Test fun rejectsLocalAndPrivateAddresses() {
        listOf(
            "https://localhost/video",
            "https://127.0.0.1/video",
            "https://10.0.0.1/video",
            "https://192.168.1.1/video",
            "https://[::1]/video",
            "https://[fc00::1]/video",
            "https://224.0.0.1/video",
            "https://printer.local/video",
            "https://service.home.arpa/video",
        ).forEach { assertTrue("Expected rejection for $it", UrlValidator.validate(it) is UrlValidator.ValidationResult.Invalid) }
    }
}
