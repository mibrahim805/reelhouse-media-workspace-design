package com.reelhouse.downloader.util

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException

/**
 * Validates URLs for security before passing them to yt-dlp.
 *
 * Security rules:
 * - Only https:// is accepted by default (http:// only if [allowHttp] is true)
 * - file://, content://, javascript:, data: schemes are always rejected
 * - Localhost, loopback, and private-network addresses are rejected
 * - URL must have a valid host component
 */
object UrlValidator {

    private val HTTP_URL = Regex("""(?i)https?://[^\s<>\"']+""")

    private val BLOCKED_SCHEMES = setOf("file", "content", "javascript", "data")

    private val BLOCKED_HOSTS = setOf(
        "localhost",
        "localhost.localdomain",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
    )

    sealed class ValidationResult {
        data class Valid(val url: String) : ValidationResult()
        data class Invalid(val reason: String) : ValidationResult()
    }

    /** Extracts the first web URL from text shared by apps such as TikTok and Facebook. */
    fun extractHttpUrl(rawText: String): String? = HTTP_URL.find(rawText.trim())
        ?.value
        ?.trimEnd('.', ',', ';', '!', ')', ']', '}')
        ?.takeIf(String::isNotBlank)

    fun validate(rawUrl: String, allowHttp: Boolean = false): ValidationResult {
        val syntax = validateSyntax(rawUrl, allowHttp)
        if (syntax !is ValidationResult.Valid) return syntax

        val host = URI(syntax.url).host
            ?: return ValidationResult.Invalid("URL must have a valid host")
        val addresses = try {
            InetAddress.getAllByName(host).toList()
        } catch (_: UnknownHostException) {
            return ValidationResult.Invalid("URL host could not be resolved")
        } catch (_: Exception) {
            return ValidationResult.Invalid("URL host could not be validated")
        }
        if (addresses.isEmpty() || addresses.any(::isPrivateAddress)) {
            return ValidationResult.Invalid("Private network addresses are not allowed")
        }

        return syntax
    }

    /** Performs non-blocking structural checks. DNS-based checks are done by [validate] on an IO thread. */
    fun validateSyntax(rawUrl: String, allowHttp: Boolean = false): ValidationResult {
        val rawTrimmed = rawUrl.trim()

        if (rawTrimmed.isBlank()) {
            return ValidationResult.Invalid("URL cannot be empty")
        }

        val trimmed = extractHttpUrl(rawTrimmed) ?: rawTrimmed

        // Check for blocked scheme prefixes before parsing
        val lowerUrl = trimmed.lowercase()
        for (scheme in BLOCKED_SCHEMES) {
            if (lowerUrl.startsWith("$scheme:")) {
                return ValidationResult.Invalid("$scheme:// URLs are not allowed")
            }
        }

        val uri = try {
            URI(trimmed)
        } catch (_: Exception) {
            return ValidationResult.Invalid("Invalid URL format")
        }

        val scheme = uri.scheme?.lowercase()
        if (scheme == null) {
            return ValidationResult.Invalid("URL must start with https://")
        }

        val allowedSchemes = if (allowHttp) setOf("https", "http") else setOf("https")
        if (scheme !in allowedSchemes) {
            return ValidationResult.Invalid("Only HTTPS URLs are allowed")
        }

        val host = uri.host?.lowercase()
        if (host.isNullOrBlank()) {
            return ValidationResult.Invalid("URL must have a valid host")
        }

        if (uri.rawUserInfo != null) {
            return ValidationResult.Invalid("URLs containing credentials are not allowed")
        }

        if (host in BLOCKED_HOSTS) {
            return ValidationResult.Invalid("Local addresses are not allowed")
        }
        if (host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".home.arpa")) {
            return ValidationResult.Invalid("Local network hostnames are not allowed")
        }

        return ValidationResult.Valid(trimmed)
    }

    private fun isPrivateAddress(address: InetAddress): Boolean {
        return when (address) {
                is Inet4Address -> {
                    val bytes = address.address.map { it.toInt() and 0xff }
                    address.isLoopbackAddress ||
                    address.isSiteLocalAddress ||
                    address.isLinkLocalAddress ||
                    address.isAnyLocalAddress ||
                    address.isMulticastAddress ||
                    bytes[0] == 0 ||
                    (bytes[0] == 100 && bytes[1] in 64..127)
                }
                is Inet6Address -> {
                    val first = address.address[0].toInt() and 0xff
                    address.isLoopbackAddress ||
                    address.isSiteLocalAddress ||
                    address.isLinkLocalAddress ||
                    address.isAnyLocalAddress ||
                    address.isMulticastAddress ||
                    first and 0xfe == 0xfc
                }
                else -> false
            }
    }
}
