package com.reelhouse.downloader.download

import android.content.Context
import android.net.Uri
import com.reelhouse.downloader.data.DownloadDao
import com.reelhouse.downloader.data.DownloadEntity
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.storage.FileManager
import com.reelhouse.downloader.storage.FileSanitizer
import com.reelhouse.downloader.util.ErrorClassifier
import com.reelhouse.downloader.util.NetworkUtil
import com.reelhouse.downloader.util.UrlValidator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Orchestrates download execution.
 *
 * Downloads execute entirely on the device:
 *   User's phone → yt-dlp (embedded) → source server → phone storage
 *
 * Railway is NEVER contacted. No proxy. No server-side processing.
 */
class DownloadManager(
    private val context: Context,
    private val dao: DownloadDao,
    private val mediaExtractor: MediaExtractor,
    private val fileManager: FileManager,
    private val notification: DownloadNotification,
    private val completionNotificationsEnabled: () -> Boolean = { true },
) {
    private val activeJobs = ConcurrentHashMap<String, Job>()
    private val cancelRequested = ConcurrentHashMap.newKeySet<String>()
    private val activeUrls = ConcurrentHashMap.newKeySet<String>()

    private val _activeDownloadIds = MutableStateFlow<Set<String>>(emptySet())
    val activeDownloadIds: StateFlow<Set<String>> = _activeDownloadIds

    /**
     * Starts a download. Returns false if a download for this URL is already active.
     */
    suspend fun startDownload(request: DownloadRequest): Boolean {
        // Prevent duplicate downloads
        if (!activeUrls.add(request.url)) return false
        val existing = dao.findActiveByUrl(request.url)
        if (existing != null) {
            activeUrls.remove(request.url)
            return false
        }

        val extension = if (request.isAudioOnly) {
            when {
                request.mergeFormat.isNotBlank() -> request.mergeFormat
                else -> "m4a"
            }
        } else {
            request.mergeFormat.ifBlank { "mp4" }
        }

        val sanitizedTitle = FileSanitizer.sanitize(
            "${request.mediaInfo.title} [${request.mediaInfo.id}].$extension"
        )

        val entity = DownloadEntity(
            id = request.id,
            url = request.url,
            sourceId = request.mediaInfo.id,
            title = request.mediaInfo.title,
            thumbnail = request.mediaInfo.thumbnail,
            platform = request.mediaInfo.platform,
            uploader = request.mediaInfo.displayUploader,
            formatLabel = request.qualityLabel,
            formatSelector = request.formatSelector,
            fileExtension = extension,
            status = DownloadEntity.Status.QUEUED,
            isAudioOnly = request.isAudioOnly,
            mimeType = fileManager.guessMimeType(sanitizedTitle),
            destination = request.destination,
            audioBitrate = request.audioBitrate,
            totalBytes = request.expectedBytes,
        )

        try {
            dao.insert(entity)
            _activeDownloadIds.value = _activeDownloadIds.value + request.id
        } catch (error: Exception) {
            activeUrls.remove(request.url)
            throw error
        }

        return true
    }

    fun hasActiveJob(id: String): Boolean = activeJobs.containsKey(id)

    suspend fun executeIfAccepted(request: DownloadRequest, wifiOnly: Boolean) {
        if (startDownload(request)) executeDownload(request, wifiOnly)
    }

    suspend fun cancelQueuedDownload(request: DownloadRequest) {
        withContext(NonCancellable + Dispatchers.IO) {
            dao.updateStatus(
                request.id,
                DownloadEntity.Status.CANCELLED,
                completedAt = System.currentTimeMillis(),
            )
            notification.cancelNotification(DownloadNotification.progressId(request.id))
            _activeDownloadIds.value = _activeDownloadIds.value - request.id
            activeJobs.remove(request.id)
            activeUrls.remove(request.url)
            cancelRequested.remove(request.id)
        }
    }

    /**
     * Executes the actual download. Called by the foreground service.
     */
    suspend fun executeDownload(request: DownloadRequest, wifiOnly: Boolean = false) {
        val extension = if (request.isAudioOnly) {
            request.mergeFormat.ifBlank { "m4a" }
        } else {
            request.mergeFormat.ifBlank { "mp4" }
        }

        val sanitizedFilename = FileSanitizer.sanitize(
            "${request.mediaInfo.title} [${request.mediaInfo.id}].$extension"
        )
        val tempPath = fileManager.getTempOutputPath(sanitizedFilename)

        try {
            val validation = UrlValidator.validate(request.url)
            require(validation is UrlValidator.ValidationResult.Valid) {
                (validation as UrlValidator.ValidationResult.Invalid).reason
            }
            check(NetworkUtil.isOnline(context)) { "No validated network connection is available." }
            check(!wifiOnly || NetworkUtil.isOnWifi(context)) {
                "Wi-Fi-only downloads are enabled. Connect to Wi-Fi and retry."
            }
            fileManager.requireDownloadCapacity(request.expectedBytes)
            dao.updateProgress(
                id = request.id,
                status = DownloadEntity.Status.DOWNLOADING,
                progress = 0.01f,
                downloaded = 0,
                total = 0,
                speed = 0,
                eta = 0,
            )

            // Execute download locally via yt-dlp
            mediaExtractor.download(
                url = request.url,
                formatSelector = request.formatSelector,
                outputPath = tempPath,
                processId = request.id,
                audioOnly = request.isAudioOnly,
                audioBitrate = request.audioBitrate,
                mergeFormat = extension,
            ) { progress, eta, line ->
                // Update progress in database (throttled by yt-dlp callback rate)
                kotlinx.coroutines.runBlocking {
                    val clampedProgress = (progress / 100f).coerceIn(0.01f, 0.99f)
                    val parsed = ProgressParser.parse(line, progress)
                    dao.updateProgress(
                        id = request.id,
                        status = DownloadEntity.Status.DOWNLOADING,
                        progress = clampedProgress,
                        downloaded = parsed.downloadedBytes,
                        total = parsed.totalBytes,
                        speed = parsed.speedBytesPerSecond,
                        eta = eta,
                    )
                    notification.showProgressNotification(
                        downloadId = request.id,
                        title = request.mediaInfo.title,
                        progress = progress.toInt().coerceIn(0, 99),
                        speed = formatSpeed(parsed.speedBytesPerSecond),
                        cancelIntent = cancelIntent(request.id),
                    )
                }
            }

            // Post-download processing
            dao.updateStatus(request.id, DownloadEntity.Status.PROCESSING)
            notification.showProgressNotification(
                downloadId = request.id,
                title = request.mediaInfo.title,
                progress = 99,
                speed = "Processing locally",
                cancelIntent = cancelIntent(request.id),
            )

            // Find the actual output file (yt-dlp may change extension)
            val outputFile = findOutputFile(tempPath)
                ?: throw Exception("Download completed but output file was not found")

            val displayName = FileSanitizer.sanitize(
                "${request.mediaInfo.title}.$extension"
            )
            val mimeType = fileManager.guessMimeType(displayName)

            // Move to public Downloads via MediaStore
            val savedMedia = fileManager.moveToPublicMedia(
                tempFile = outputFile,
                displayName = displayName,
                mimeType = mimeType,
                destination = request.destination,
                audioOnly = request.isAudioOnly,
            )
                ?: throw Exception("Failed to save file to Downloads")

            val descriptorSize = try {
                context.contentResolver.openFileDescriptor(savedMedia.uri, "r")?.use {
                    it.statSize
                } ?: 0L
            } catch (_: Exception) { 0L }
            val fileSize = descriptorSize.takeIf { it > 0L } ?: savedMedia.sizeBytes
            check(fileSize > 0L) { "The saved MediaStore file is empty." }

            dao.markComplete(
                id = request.id,
                contentUri = savedMedia.uri.toString(),
                fileSize = fileSize,
                displayName = savedMedia.displayName,
                savedLocation = savedMedia.location,
            )

            notification.cancelNotification(DownloadNotification.progressId(request.id))
            if (completionNotificationsEnabled()) {
                notification.showCompleteNotification(
                    request.mediaInfo.title,
                    DownloadNotification.COMPLETE_NOTIFICATION_BASE_ID + (request.id.hashCode() and 0x0fffffff),
                )
            }

        } catch (e: CancellationException) {
            withContext(NonCancellable + Dispatchers.IO) {
                dao.updateStatus(
                    request.id,
                    DownloadEntity.Status.CANCELLED,
                    completedAt = System.currentTimeMillis(),
                )
                cleanupTempFile(tempPath)
            }
            throw e
        } catch (e: Exception) {
            if (request.id in cancelRequested) {
                dao.updateStatus(
                    request.id,
                    DownloadEntity.Status.CANCELLED,
                    completedAt = System.currentTimeMillis(),
                )
                cleanupTempFile(tempPath)
                return
            }
            val errorType = ErrorClassifier.classify(e)
            dao.updateStatus(
                id = request.id,
                status = DownloadEntity.Status.FAILED,
                error = context.getString(errorType.messageResId),
                errorType = errorType.name,
                completedAt = System.currentTimeMillis(),
            )
            cleanupTempFile(tempPath)

            if (completionNotificationsEnabled()) {
                notification.showFailedNotification(
                    request.mediaInfo.title,
                    context.getString(errorType.messageResId),
                    DownloadNotification.COMPLETE_NOTIFICATION_BASE_ID + (request.id.hashCode() and 0x0fffffff),
                )
            }
        } finally {
            notification.cancelNotification(DownloadNotification.progressId(request.id))
            _activeDownloadIds.value = _activeDownloadIds.value - request.id
            activeJobs.remove(request.id)
            activeUrls.remove(request.url)
            cancelRequested.remove(request.id)
        }
    }

    fun registerJob(downloadId: String, job: Job) {
        activeJobs[downloadId] = job
    }

    /**
     * Cancels an active download.
     */
    fun cancelDownload(downloadId: String) {
        cancelRequested += downloadId
        activeJobs[downloadId]?.cancel()
        YoutubeDL_cancel(downloadId)
    }

    fun cancelAllDownloads() {
        activeJobs.keys.toList().forEach(::cancelDownload)
    }

    private fun YoutubeDL_cancel(processId: String) {
        try {
            com.yausername.youtubedl_android.YoutubeDL.getInstance().destroyProcessById(processId)
        } catch (_: Exception) {
            // Process may already be finished
        }
    }

    private fun findOutputFile(basePath: String): File? {
        val base = File(basePath)
        if (!basePath.contains("%(ext)s") && base.exists()) return base

        // yt-dlp may have changed the extension (e.g., .mp4 instead of .webm)
        val parent = base.parentFile ?: return null
        val nameWithoutExt = outputStem(base)

        return parent.listFiles()
            ?.filter {
                it.nameWithoutExtension == nameWithoutExt &&
                    it.isFile &&
                    !it.name.endsWith(".part") &&
                    !it.name.endsWith(".ytdl")
            }
            ?.maxByOrNull { it.lastModified() }
    }

    private fun cleanupTempFile(path: String) {
        try {
            val file = File(path)
            file.delete()
            // Also try common variants
            File("$path.part").delete()
            File("$path.ytdl").delete()
            val base = File(path)
            val stem = outputStem(base)
            base.parentFile?.listFiles()?.filter {
                it.nameWithoutExtension == stem || it.name.startsWith("$stem.")
            }?.forEach { it.delete() }
        } catch (_: Exception) {
            // Best-effort cleanup
        }
    }

    private fun outputStem(file: File): String =
        file.name.substringBefore(".%(ext)s").ifBlank { file.nameWithoutExtension }

    private fun cancelIntent(downloadId: String): android.app.PendingIntent =
        android.app.PendingIntent.getService(
            context,
            downloadId.hashCode(),
            DownloadService.createCancelIntent(context, downloadId),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )

    private fun formatSpeed(bytesPerSecond: Long): String = when {
        bytesPerSecond >= 1024 * 1024 -> "%.1f MB/s".format(bytesPerSecond / (1024.0 * 1024.0))
        bytesPerSecond >= 1024 -> "%.0f KB/s".format(bytesPerSecond / 1024.0)
        else -> ""
    }

    suspend fun cleanAllTempFiles() = withContext(Dispatchers.IO) {
        fileManager.cleanTempFiles()
    }
}
