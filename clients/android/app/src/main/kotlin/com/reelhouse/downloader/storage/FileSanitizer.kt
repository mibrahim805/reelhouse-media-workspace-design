package com.reelhouse.downloader.storage

/**
 * Sanitizes filenames to prevent path traversal, illegal characters,
 * and other filesystem issues.
 */
object FileSanitizer {

    private const val MAX_FILENAME_LENGTH = 200

    // Characters not allowed in filenames across common filesystems
    private val ILLEGAL_CHARS = Regex("[\\\\/:*?\"<>|\\x00-\\x1f]")

    // Path traversal patterns
    private val PATH_TRAVERSAL = Regex("\\.{2,}[/\\\\]?")

    fun sanitize(filename: String): String {
        var clean = filename.trim()

        // Remove path traversal
        clean = PATH_TRAVERSAL.replace(clean, "")

        // Remove illegal characters
        clean = ILLEGAL_CHARS.replace(clean, "_")

        // Remove leading/trailing dots and spaces (Windows compat)
        clean = clean.trim('.', ' ')

        // Collapse consecutive underscores
        clean = clean.replace(Regex("_{2,}"), "_")

        // Truncate to reasonable length, preserving extension
        if (clean.length > MAX_FILENAME_LENGTH) {
            val dotIndex = clean.lastIndexOf('.')
            if (dotIndex > 0 && dotIndex > clean.length - 10) {
                val ext = clean.substring(dotIndex)
                val name = clean.substring(0, MAX_FILENAME_LENGTH - ext.length)
                clean = name.trimEnd('_', ' ') + ext
            } else {
                clean = clean.substring(0, MAX_FILENAME_LENGTH)
            }
        }

        // Fallback for empty result
        if (clean.isBlank()) {
            clean = "download"
        }

        return clean
    }

    /**
     * Creates a unique filename by appending a counter if the name already exists.
     */
    fun makeUnique(baseName: String, existingNames: Set<String>): String {
        if (baseName !in existingNames) return baseName

        val dotIndex = baseName.lastIndexOf('.')
        val name = if (dotIndex > 0) baseName.substring(0, dotIndex) else baseName
        val ext = if (dotIndex > 0) baseName.substring(dotIndex) else ""

        var counter = 1
        while (true) {
            val candidate = "$name ($counter)$ext"
            if (candidate !in existingNames) return candidate
            counter++
            if (counter > 9999) return "$name (${System.currentTimeMillis()})$ext"
        }
    }
}
