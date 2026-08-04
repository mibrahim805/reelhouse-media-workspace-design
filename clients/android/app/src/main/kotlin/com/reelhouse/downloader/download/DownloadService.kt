package com.reelhouse.downloader.download

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import com.reelhouse.downloader.data.DownloadDatabase
import com.reelhouse.downloader.data.PreferencesRepository
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.media.MediaInfo
import com.reelhouse.downloader.storage.FileManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground service for long-running downloads.
 *
 * Displays an ongoing notification with progress.
 * Downloads run on IO dispatcher, never on the main thread.
 * All media traffic goes directly from the phone to the source — never through Railway.
 */
class DownloadService : Service() {

    companion object {
        const val ACTION_START = "com.reelhouse.downloader.START_DOWNLOAD"
        const val ACTION_CANCEL = "com.reelhouse.downloader.CANCEL_DOWNLOAD"

        const val EXTRA_DOWNLOAD_ID = "download_id"
        const val EXTRA_URL = "url"
        const val EXTRA_FORMAT_SELECTOR = "format_selector"
        const val EXTRA_IS_AUDIO_ONLY = "is_audio_only"
        const val EXTRA_MERGE_FORMAT = "merge_format"
        const val EXTRA_QUALITY_LABEL = "quality_label"
        const val EXTRA_MEDIA_INFO_JSON = "media_info_json"
        const val EXTRA_DESTINATION = "destination"
        const val EXTRA_AUDIO_BITRATE = "audio_bitrate"
        const val EXTRA_EXPECTED_BYTES = "expected_bytes"

        fun createStartIntent(
            context: Context,
            request: DownloadRequest,
        ): Intent {
            val json = Json { ignoreUnknownKeys = true }
            return Intent(context, DownloadService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_DOWNLOAD_ID, request.id)
                putExtra(EXTRA_URL, request.url)
                putExtra(EXTRA_FORMAT_SELECTOR, request.formatSelector)
                putExtra(EXTRA_IS_AUDIO_ONLY, request.isAudioOnly)
                putExtra(EXTRA_MERGE_FORMAT, request.mergeFormat)
                putExtra(EXTRA_QUALITY_LABEL, request.qualityLabel)
                putExtra(EXTRA_MEDIA_INFO_JSON, json.encodeToString(
                    MediaInfo.serializer(), request.mediaInfo
                ))
                putExtra(EXTRA_DESTINATION, request.destination)
                putExtra(EXTRA_AUDIO_BITRATE, request.audioBitrate ?: -1)
                putExtra(EXTRA_EXPECTED_BYTES, request.expectedBytes)
            }
        }

        fun createCancelIntent(context: Context, downloadId: String): Intent {
            return Intent(context, DownloadService::class.java).apply {
                action = ACTION_CANCEL
                putExtra(EXTRA_DOWNLOAD_ID, downloadId)
            }
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    private lateinit var downloadManager: DownloadManager
    private lateinit var notification: DownloadNotification

    private val activeJobCount = AtomicInteger(0)
    private val completionNotifications = AtomicBoolean(true)
    private val executionMutex = Mutex()
    private lateinit var wakeLock: PowerManager.WakeLock

    override fun onCreate() {
        super.onCreate()

        val db = DownloadDatabase.getInstance(applicationContext)
        val mediaExtractor = MediaExtractor(applicationContext)
        val fileManager = FileManager(applicationContext)
        notification = DownloadNotification(applicationContext)
        notification.createChannel()
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "$packageName:downloads",
        ).apply { setReferenceCounted(false) }

        serviceScope.launch {
            PreferencesRepository(applicationContext).notificationsEnabled.collect {
                completionNotifications.set(it)
            }
        }

        downloadManager = DownloadManager(
            context = applicationContext,
            dao = db.downloadDao(),
            mediaExtractor = mediaExtractor,
            fileManager = fileManager,
            notification = notification,
            completionNotificationsEnabled = completionNotifications::get,
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val downloadId = intent.getStringExtra(EXTRA_DOWNLOAD_ID) ?: return START_NOT_STICKY
                val url = intent.getStringExtra(EXTRA_URL) ?: return START_NOT_STICKY
                val formatSelector = intent.getStringExtra(EXTRA_FORMAT_SELECTOR) ?: "best"
                val isAudioOnly = intent.getBooleanExtra(EXTRA_IS_AUDIO_ONLY, false)
                val mergeFormat = intent.getStringExtra(EXTRA_MERGE_FORMAT) ?: "mp4"
                val qualityLabel = intent.getStringExtra(EXTRA_QUALITY_LABEL) ?: ""
                val mediaInfoJson = intent.getStringExtra(EXTRA_MEDIA_INFO_JSON) ?: "{}"
                val destination = intent.getStringExtra(EXTRA_DESTINATION) ?: "downloads"
                val audioBitrate = intent.getIntExtra(EXTRA_AUDIO_BITRATE, -1)
                    .takeIf { it > 0 }
                val expectedBytes = intent.getLongExtra(EXTRA_EXPECTED_BYTES, 0L)

                val mediaInfo = try {
                    json.decodeFromString(MediaInfo.serializer(), mediaInfoJson)
                } catch (_: Exception) {
                    MediaInfo()
                }

                val request = DownloadRequest(
                    id = downloadId,
                    url = url,
                    mediaInfo = mediaInfo,
                    formatSelector = formatSelector,
                    isAudioOnly = isAudioOnly,
                    mergeFormat = mergeFormat,
                    qualityLabel = qualityLabel,
                    destination = destination,
                    audioBitrate = audioBitrate,
                    expectedBytes = expectedBytes,
                )

                if (!downloadManager.hasActiveJob(request.id)) {
                    val jobCount = activeJobCount.incrementAndGet()
                    if (!wakeLock.isHeld) wakeLock.acquire()
                    startForegroundWithNotification(jobCount)
                    enqueueDownload(request)
                }
            }

            ACTION_CANCEL -> {
                val downloadId = intent.getStringExtra(EXTRA_DOWNLOAD_ID)
                if (downloadId != null) {
                    downloadManager.cancelDownload(downloadId)
                }
            }
        }

        // Ask Android to redeliver the request if it has to recreate this
        // foreground service. yt-dlp's default .part behavior then continues
        // the same output instead of abandoning the persisted Room job.
        return START_REDELIVER_INTENT
    }

    private fun startForegroundWithNotification(jobCount: Int) {
        val notif = notification.buildServiceNotification(jobCount)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                DownloadNotification.SERVICE_NOTIFICATION_ID,
                notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(DownloadNotification.SERVICE_NOTIFICATION_ID, notif)
        }
    }

    private fun enqueueDownload(request: DownloadRequest) {
        val job = serviceScope.launch(start = CoroutineStart.LAZY) {
            var accepted = false
            var executionStarted = false
            try {
                val preferences = PreferencesRepository(applicationContext)
                val wifiOnly = preferences.wifiOnly.first()
                accepted = downloadManager.startDownload(request)
                if (!accepted) {
                    notification.cancelNotification(DownloadNotification.progressId(request.id))
                    return@launch
                }
                executionMutex.withLock {
                    executionStarted = true
                    downloadManager.executeDownload(request, wifiOnly)
                }
            } catch (error: CancellationException) {
                if (accepted && !executionStarted) {
                    downloadManager.cancelQueuedDownload(request)
                }
                throw error
            } catch (_: Exception) {
                notification.cancelNotification(DownloadNotification.progressId(request.id))
                if (completionNotifications.get()) {
                    notification.showFailedNotification(
                        request.mediaInfo.title,
                        "The local download job could not be created.",
                        DownloadNotification.COMPLETE_NOTIFICATION_BASE_ID +
                            (request.id.hashCode() and 0x0fffffff),
                    )
                }
            } finally {
                val remaining = activeJobCount.decrementAndGet()
                if (remaining <= 0) {
                    if (wakeLock.isHeld) wakeLock.release()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    notification.updateServiceNotification(remaining)
                }
            }
        }

        downloadManager.registerJob(request.id, job)
        notification.showProgressNotification(
            downloadId = request.id,
            title = request.mediaInfo.title,
            progress = 0,
            speed = "Queued",
            cancelIntent = PendingIntent.getService(
                this,
                request.id.hashCode(),
                createCancelIntent(this, request.id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ),
        )
        job.start()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTimeout(startId: Int, fgsType: Int) {
        // Android 15 limits dataSync foreground services to six hours in a
        // rolling 24-hour window. Stop promptly when the platform invokes the
        // timeout callback instead of allowing a RemoteServiceException.
        downloadManager.cancelAllDownloads()
        stopSelf(startId)
    }

    override fun onDestroy() {
        if (::wakeLock.isInitialized && wakeLock.isHeld) wakeLock.release()
        super.onDestroy()
        serviceScope.cancel()
    }
}
