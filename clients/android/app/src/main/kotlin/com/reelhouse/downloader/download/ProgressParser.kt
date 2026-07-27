package com.reelhouse.downloader.download

data class ParsedProgress(
    val downloadedBytes: Long = 0,
    val totalBytes: Long = 0,
    val speedBytesPerSecond: Long = 0,
)

object ProgressParser {
    private val downloadLine = Regex(
        "(?i)\\[download]\\s+[\\d.]+%\\s+of\\s+~?\\s*([\\d.]+)([KMGT]?i?B)(?:\\s+at\\s+([\\d.]+)([KMGT]?i?B)/s)?"
    )

    fun parse(line: String, progressPercent: Float): ParsedProgress {
        val match = downloadLine.find(line) ?: return ParsedProgress()
        val total = bytes(match.groupValues[1], match.groupValues[2])
        val speed = if (match.groupValues[3].isNotBlank()) {
            bytes(match.groupValues[3], match.groupValues[4])
        } else 0L
        val downloaded = if (total > 0) {
            (total * (progressPercent / 100.0)).toLong().coerceAtMost(total)
        } else 0L
        return ParsedProgress(downloaded, total, speed)
    }

    private fun bytes(number: String, unit: String): Long {
        val multiplier = when (unit.lowercase()) {
            "kb" -> 1_000.0
            "kib" -> 1_024.0
            "mb" -> 1_000_000.0
            "mib" -> 1_048_576.0
            "gb" -> 1_000_000_000.0
            "gib" -> 1_073_741_824.0
            "tb" -> 1_000_000_000_000.0
            "tib" -> 1_099_511_627_776.0
            else -> 1.0
        }
        return ((number.toDoubleOrNull() ?: 0.0) * multiplier).toLong()
    }
}
