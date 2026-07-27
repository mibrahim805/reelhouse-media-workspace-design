package com.reelhouse.downloader.storage

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream

/**
 * Manages file storage using Android scoped storage.
 *
 * Temporary files go to app-private cache.
 * Completed downloads are copied to public Downloads via MediaStore.
 * No MANAGE_EXTERNAL_STORAGE permission is used.
 */
class FileManager(private val context: Context) {

    data class SavedMedia(
        val uri: Uri,
        val displayName: String,
        val location: String,
        val sizeBytes: Long,
    )

    private val tempDir: File
        get() = File(context.cacheDir, "downloads").apply { mkdirs() }

    /**
     * Returns a temporary file path for yt-dlp to write to.
     */
    fun getTempOutputPath(sanitizedFilename: String): String {
        val safeStem = File(sanitizedFilename).nameWithoutExtension
        // Let yt-dlp choose the source extension before local merge/remux or
        // audio conversion. A fixed extension can otherwise label WebM bytes
        // as MP3/MP4 before FFmpeg runs.
        val file = File(tempDir, "$safeStem.%(ext)s")
        return file.absolutePath
    }

    /**
     * Moves a completed download from temp storage to public Downloads via MediaStore.
     * Returns the content URI of the saved file.
     */
    fun moveToPublicMedia(
        tempFile: File,
        displayName: String,
        mimeType: String,
        destination: String,
        audioOnly: Boolean,
    ): SavedMedia? {
        val sanitized = FileSanitizer.sanitize(displayName)

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            moveWithMediaStore(tempFile, sanitized, mimeType, destination, audioOnly)
        } else {
            moveToLegacyCollection(tempFile, sanitized, destination, audioOnly)
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun moveWithMediaStore(
        tempFile: File,
        displayName: String,
        mimeType: String,
        destination: String,
        audioOnly: Boolean,
    ): SavedMedia? {
        val useMediaCollection = destination == "media"
        val collection = when {
            useMediaCollection && audioOnly -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            useMediaCollection -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            else -> MediaStore.Downloads.EXTERNAL_CONTENT_URI
        }
        val publicDirectory = when {
            useMediaCollection && audioOnly -> Environment.DIRECTORY_MUSIC
            useMediaCollection -> Environment.DIRECTORY_MOVIES
            else -> Environment.DIRECTORY_DOWNLOADS
        }
        val relativePath = "$publicDirectory/Reelhouse/"
        val uniqueName = uniqueMediaStoreName(collection, relativePath, displayName)
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, uniqueName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val resolver = context.contentResolver
        val uri = resolver.insert(collection, values)
            ?: return null

        try {
            val bytesCopied = resolver.openOutputStream(uri, "w")?.use { output ->
                FileInputStream(tempFile).use { input ->
                    input.copyTo(output, bufferSize = 8192)
                }
            } ?: error("MediaStore did not provide a writable output stream.")
            check(bytesCopied > 0L && bytesCopied == tempFile.length()) {
                "The completed media file could not be copied safely."
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                check(resolver.update(uri, values, null, null) > 0) {
                    "The completed MediaStore item could not be published."
                }
            }

            // Clean up temp file
            tempFile.delete()
            return SavedMedia(uri, uniqueName, relativePath.trimEnd('/'), bytesCopied)
        } catch (e: Exception) {
            // Clean up failed MediaStore entry
            resolver.delete(uri, null, null)
            throw e
        }
    }

    @Suppress("DEPRECATION")
    private fun moveToLegacyCollection(
        tempFile: File,
        displayName: String,
        destination: String,
        audioOnly: Boolean,
    ): SavedMedia? {
        val publicDirectory = when {
            destination == "media" && audioOnly -> Environment.DIRECTORY_MUSIC
            destination == "media" -> Environment.DIRECTORY_MOVIES
            else -> Environment.DIRECTORY_DOWNLOADS
        }
        val downloadsDir = File(
            Environment.getExternalStoragePublicDirectory(publicDirectory),
            "Reelhouse"
        ).apply { mkdirs() }

        val destFile = File(downloadsDir, displayName)
        val uniqueName = if (destFile.exists()) {
            val existing = downloadsDir.list()?.toSet() ?: emptySet()
            FileSanitizer.makeUnique(displayName, existing)
        } else {
            displayName
        }

        val finalFile = File(downloadsDir, uniqueName)
        val expectedSize = tempFile.length()
        tempFile.copyTo(finalFile, overwrite = false)
        check(finalFile.length() > 0L && finalFile.length() == expectedSize) {
            finalFile.delete()
            "The completed media file could not be copied safely."
        }
        tempFile.delete()

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.files",
            finalFile,
        )
        return SavedMedia(uri, uniqueName, "${publicDirectory}/Reelhouse", finalFile.length())
    }

    private fun uniqueMediaStoreName(
        collection: Uri,
        relativePath: String,
        displayName: String,
    ): String {
        val existingNames = mutableSetOf<String>()
        try {
            context.contentResolver.query(
                collection,
                arrayOf(MediaStore.MediaColumns.DISPLAY_NAME),
                "${MediaStore.MediaColumns.RELATIVE_PATH} = ? OR ${MediaStore.MediaColumns.RELATIVE_PATH} = ?",
                arrayOf(relativePath, relativePath.trimEnd('/')),
                null,
            )?.use { cursor ->
                val nameColumn = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
                while (nameColumn >= 0 && cursor.moveToNext()) {
                    cursor.getString(nameColumn)?.let(existingNames::add)
                }
            }
        } catch (_: Exception) {
            // Some vendor MediaStore implementations reject RELATIVE_PATH
            // selection. Insertion remains scoped and the provider will still
            // choose a valid filesystem entry.
        }
        return FileSanitizer.makeUnique(displayName, existingNames)
    }

    @Suppress("UsableSpace") // Deliberately conservative: do not count cache Android may evict.
    fun requireDownloadCapacity(expectedBytes: Long) {
        val reserve = 64L * 1024L * 1024L
        val boundedExpected = expectedBytes.coerceAtLeast(32L * 1024L * 1024L)
            .coerceAtMost((Long.MAX_VALUE - reserve) / 2L)
        val required = boundedExpected * 2L + reserve
        check(context.cacheDir.usableSpace >= required) {
            "Not enough storage space. Free at least ${formatRequiredBytes(required)} and retry."
        }
    }

    private fun formatRequiredBytes(bytes: Long): String {
        val megabytes = bytes / (1024.0 * 1024.0)
        return if (megabytes >= 1024.0) {
            "%.1f GB".format(megabytes / 1024.0)
        } else {
            "%.0f MB".format(megabytes)
        }
    }

    /**
     * Returns the MIME type based on file extension.
     */
    fun guessMimeType(filename: String): String {
        val ext = filename.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "mp4", "m4v" -> "video/mp4"
            "mkv" -> "video/x-matroska"
            "webm" -> "video/webm"
            "3gp" -> "video/3gpp"
            "mov" -> "video/quicktime"
            "avi" -> "video/x-msvideo"
            "mp3" -> "audio/mpeg"
            "m4a", "aac" -> "audio/mp4"
            "ogg", "oga" -> "audio/ogg"
            "opus" -> "audio/opus"
            "wav" -> "audio/wav"
            "flac" -> "audio/flac"
            "weba" -> "audio/webm"
            else -> "application/octet-stream"
        }
    }

    /**
     * Creates an open intent for a content URI.
     */
    fun createOpenIntent(uri: Uri, mimeType: String): Intent {
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    /**
     * Creates a share intent for a content URI.
     */
    fun createShareIntent(uri: Uri, mimeType: String, title: String): Intent {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(shareIntent, "Share via")
    }

    /**
     * Deletes a file by its content URI.
     */
    fun deleteFile(uri: Uri): Boolean {
        return try {
            val deleted = context.contentResolver.delete(uri, null, null)
            deleted > 0
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Cleans up all temporary files.
     */
    fun cleanTempFiles() {
        tempDir.listFiles()?.forEach { it.delete() }
    }

    /**
     * Returns the total size of temp files in bytes.
     */
    fun getTempSize(): Long {
        return tempDir.listFiles()?.sumOf { it.length() } ?: 0L
    }
}
