package com.reelhouse.downloader.util

import com.reelhouse.downloader.R

/**
 * Classifies yt-dlp error output into user-friendly categories.
 * Maps raw exception messages to string resource IDs.
 */
object ErrorClassifier {

    enum class ErrorType(val messageResId: Int) {
        INVALID_URL(R.string.error_invalid_url),
        UNSUPPORTED_PLATFORM(R.string.error_unsupported_platform),
        PRIVATE_CONTENT(R.string.error_private_content),
        AGE_RESTRICTED(R.string.error_age_restricted),
        AUTH_REQUIRED(R.string.error_auth_required),
        REGION_RESTRICTED(R.string.error_region_restricted),
        RATE_LIMITED(R.string.error_rate_limited),
        FORBIDDEN(R.string.error_forbidden),
        EXTRACTION_FAILED(R.string.error_extraction_failed),
        NO_FORMATS(R.string.error_no_formats),
        NETWORK_ERROR(R.string.error_network),
        INSUFFICIENT_STORAGE(R.string.error_insufficient_storage),
        FFMPEG_FAILED(R.string.error_ffmpeg_failed),
        CANCELLED(R.string.error_cancelled),
        OUTDATED_EXTRACTOR(R.string.error_outdated_extractor),
        STORAGE_FAILED(R.string.error_storage_failed),
        BLOCKED_URL(R.string.error_blocked_url),
        UNKNOWN(R.string.error_unknown),
    }

    fun classify(error: Throwable): ErrorType {
        val message = (error.message ?: "").lowercase()
        return classify(message)
    }

    fun classify(message: String): ErrorType {
        val lower = message.lowercase()

        return when {
            // Authentication / access issues
            "sign in" in lower || "login" in lower || "cookies" in lower ->
                ErrorType.AUTH_REQUIRED
            "private" in lower ->
                ErrorType.PRIVATE_CONTENT
            "age" in lower || "confirm your age" in lower ->
                ErrorType.AGE_RESTRICTED
            "not available" in lower && ("country" in lower || "region" in lower) ->
                ErrorType.REGION_RESTRICTED
            "not available" in lower || "unavailable" in lower || "removed" in lower ->
                ErrorType.PRIVATE_CONTENT

            // HTTP errors
            "403" in lower || "forbidden" in lower ->
                ErrorType.FORBIDDEN
            "429" in lower || "rate limit" in lower || "too many" in lower ->
                ErrorType.RATE_LIMITED

            // Extraction issues
            "unsupported url" in lower || "no suitable extractor" in lower ->
                ErrorType.UNSUPPORTED_PLATFORM
            "no video formats" in lower || "requested format" in lower ->
                ErrorType.NO_FORMATS
            "outdated" in lower || "update" in lower && "yt-dlp" in lower ->
                ErrorType.OUTDATED_EXTRACTOR

            // Technical errors
            "no space" in lower || "storage" in lower || "disk" in lower ->
                ErrorType.INSUFFICIENT_STORAGE
            "ffmpeg" in lower || "merge" in lower || "mux" in lower ->
                ErrorType.FFMPEG_FAILED
            "mediastore" in lower || "save file" in lower || "saved file" in lower ||
                "writable output" in lower || "could not be copied" in lower ||
                "could not be published" in lower ->
                ErrorType.STORAGE_FAILED
            "network" in lower || "connection" in lower || "wi-fi" in lower || "wifi" in lower || "timeout" in lower ||
            "unable to download" in lower || "urlopen" in lower ->
                ErrorType.NETWORK_ERROR

            // Cancellation
            "cancel" in lower || "interrupt" in lower ->
                ErrorType.CANCELLED

            // Generic extraction failure
            "extract" in lower || "download" in lower ->
                ErrorType.EXTRACTION_FAILED

            else -> ErrorType.UNKNOWN
        }
    }
}
