package com.reelhouse.downloader.youtube

import android.app.Application
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.reelhouse.downloader.BuildConfig
import com.reelhouse.downloader.ReelhouseApp
import java.io.File
import java.net.URI
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

val youtubeTopics = listOf(
    "All",
    "Music",
    "Pakistani dramas",
    "News",
    "T-Series",
    "Atif Aslam",
    "Gaming",
    "Mixes",
    "Live",
)

enum class BackendDownloadPhase {
    IDLE,
    STARTING,
    DOWNLOADING,
    PROCESSING,
    SAVING,
    COMPLETE,
    ERROR,
}

data class BackendDownloadState(
    val phase: BackendDownloadPhase = BackendDownloadPhase.IDLE,
    val percent: Int = 0,
    val message: String = "",
)

data class LocalDownloadFallback(
    val token: Long,
    val video: BackendVideo,
    val quality: String,
)

data class YouTubeState(
    val topic: String = "All",
    val query: String = "",
    val videos: List<BackendVideo> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val selectedVideo: BackendVideo? = null,
    val selectedQuality: String = "best",
    val watchLoading: Boolean = false,
    val watchError: String? = null,
    val download: BackendDownloadState = BackendDownloadState(),
    val localFallback: LocalDownloadFallback? = null,
)

class YouTubeViewModel(
    application: Application,
    private val backend: ReelhouseBackend = ReelhouseBackend(),
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(YouTubeState())
    val state: StateFlow<YouTubeState> = _state.asStateFlow()

    private var browseJob: Job? = null
    private var watchJob: Job? = null
    private var downloadJob: Job? = null
    private val downloadManager =
        application.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    init {
        loadTopic("All")
    }

    fun loadTopic(topic: String) {
        if (topic !in youtubeTopics) return
        browseJob?.cancel()
        browseJob = viewModelScope.launch {
            _state.update {
                it.copy(topic = topic, query = "", loading = true, error = null)
            }
            try {
                val videos = backend.topic(topic)
                _state.update { it.copy(videos = videos, loading = false) }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        videos = emptyList(),
                        loading = false,
                        error = error.message ?: "Could not load videos.",
                    )
                }
            }
        }
    }

    fun search(query: String) {
        val cleaned = query.trim()
        if (cleaned.isBlank()) {
            loadTopic("All")
            return
        }
        browseJob?.cancel()
        browseJob = viewModelScope.launch {
            _state.update {
                it.copy(query = cleaned, loading = true, error = null)
            }
            try {
                val videos = backend.search(cleaned)
                _state.update { it.copy(videos = videos, loading = false) }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        videos = emptyList(),
                        loading = false,
                        error = error.message ?: "Search failed.",
                    )
                }
            }
        }
    }

    fun selectVideo(video: BackendVideo) {
        watchJob?.cancel()
        downloadJob?.cancel()
        val fallback = video.copy(
            id = video.id.ifBlank { YouTubeUrls.videoId(video.sourceUrl).orEmpty() },
        )
        _state.update {
            it.copy(
                selectedVideo = fallback,
                selectedQuality = "best",
                watchLoading = true,
                watchError = null,
                download = BackendDownloadState(),
                localFallback = null,
            )
        }
        watchJob = viewModelScope.launch {
            try {
                val loaded = backend.info(fallback.sourceUrl)
                val merged = loaded.copy(
                    id = loaded.id.ifBlank { fallback.id },
                    title = loaded.title.ifBlank { fallback.title },
                    channel = loaded.channel.ifBlank { fallback.channel },
                    duration = loaded.duration.ifBlank { fallback.duration },
                    thumbnail = loaded.thumbnail.ifBlank { fallback.thumbnail },
                    sourceUrl = loaded.sourceUrl.ifBlank { fallback.sourceUrl },
                )
                val preferred = merged.qualities.firstOrNull { it.value == "1080" }
                    ?: merged.qualities.firstOrNull()
                _state.update {
                    it.copy(
                        selectedVideo = merged,
                        selectedQuality = preferred?.value ?: "best",
                        watchLoading = false,
                    )
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        watchLoading = false,
                        watchError = error.message ?: "Download options are unavailable.",
                    )
                }
            }
        }
    }

    fun setQuality(value: String) {
        _state.update { it.copy(selectedQuality = value) }
    }

    fun startBackendDownload() {
        val video = _state.value.selectedVideo ?: return
        if (_state.value.download.phase in setOf(
                BackendDownloadPhase.STARTING,
                BackendDownloadPhase.DOWNLOADING,
                BackendDownloadPhase.PROCESSING,
                BackendDownloadPhase.SAVING,
            )
        ) return

        val quality = _state.value.selectedQuality.ifBlank { "best" }
        downloadJob?.cancel()
        downloadJob = viewModelScope.launch {
            _state.update {
                it.copy(
                    download = BackendDownloadState(
                        phase = BackendDownloadPhase.STARTING,
                        message = "Starting backend download…",
                    ),
                )
            }
            try {
                val jobId = backend.startDownload(video.sourceUrl, quality)
                while (isActive) {
                    val job = backend.progress(jobId)
                    when (job.status) {
                        "complete" -> {
                            val file = job.result
                                ?: throw BackendRequestException("The backend finished without a file.")
                            _state.update {
                                it.copy(
                                    download = BackendDownloadState(
                                        phase = BackendDownloadPhase.SAVING,
                                        percent = 0,
                                        message = "Saving ${file.filename} to this phone…",
                                    ),
                                )
                            }
                            val downloadId = withContext(Dispatchers.IO) { enqueueFile(file) }
                            monitorDeviceDownload(downloadId, file.filename)
                            return@launch
                        }

                        "error" -> throw BackendRequestException(job.error ?: "Download failed.")
                        "processing" -> _state.update {
                            it.copy(
                                download = BackendDownloadState(
                                    phase = BackendDownloadPhase.PROCESSING,
                                    percent = job.percent.coerceIn(0, 99),
                                    message = "Processing on the Reelhouse backend…",
                                ),
                            )
                        }

                        else -> _state.update {
                            it.copy(
                                download = BackendDownloadState(
                                    phase = BackendDownloadPhase.DOWNLOADING,
                                    percent = job.percent.coerceIn(0, 99),
                                    message = "Downloading on the Reelhouse backend…",
                                ),
                            )
                        }
                    }
                    delay(900)
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        download = BackendDownloadState(
                            phase = BackendDownloadPhase.STARTING,
                            message = "The hosted backend was blocked. Continuing on this phone…",
                        ),
                        localFallback = LocalDownloadFallback(
                            token = System.nanoTime(),
                            video = video,
                            quality = quality,
                        ),
                    )
                }
            }
        }
    }

    fun consumeLocalFallback() {
        _state.update { it.copy(localFallback = null, download = BackendDownloadState()) }
    }

    fun clearDownloadStatus() {
        _state.update { it.copy(download = BackendDownloadState()) }
    }

    private fun enqueueFile(file: BackendFile): Long {
        val uri = Uri.parse(file.fileUrl)
        val expectedHost = URI(BuildConfig.REELHOUSE_WEB_BASE_URL).host
        require(uri.scheme == "https" && uri.host == expectedHost) {
            "The backend returned an untrusted file address."
        }
        val filename = safeFilename(file.filename)
        val request = DownloadManager.Request(uri).apply {
            setTitle(filename)
            setDescription("Downloading with Reelhouse")
            setMimeType("video/mp4")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    "Reelhouse/$filename",
                )
            } else {
                val directory = File(
                    getApplication<Application>().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "Reelhouse",
                ).apply { mkdirs() }
                setDestinationUri(Uri.fromFile(uniqueFile(directory, filename)))
            }
        }
        return downloadManager.enqueue(request)
    }

    private suspend fun monitorDeviceDownload(downloadId: Long, filename: String) {
        while (viewModelScope.isActive) {
            val snapshot = withContext(Dispatchers.IO) {
                downloadManager.query(DownloadManager.Query().setFilterById(downloadId))?.use { cursor ->
                    if (!cursor.moveToFirst()) return@use null
                    val status = cursor.getInt(
                        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS),
                    )
                    val downloaded = cursor.getLong(
                        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                    )
                    val total = cursor.getLong(
                        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
                    )
                    Triple(status, downloaded, total)
                }
            } ?: throw BackendRequestException("The Android download could not be tracked.")

            val (status, downloaded, total) = snapshot
            val percent = if (total > 0) ((downloaded * 100) / total).toInt().coerceIn(0, 99) else 0
            when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                    _state.update {
                        it.copy(
                            download = BackendDownloadState(
                                phase = BackendDownloadPhase.COMPLETE,
                                percent = 100,
                                message = "Saved $filename to Downloads/Reelhouse.",
                            ),
                        )
                    }
                    return
                }

                DownloadManager.STATUS_FAILED ->
                    throw BackendRequestException("Android could not save the downloaded file.")

                else -> _state.update {
                    it.copy(
                        download = BackendDownloadState(
                            phase = BackendDownloadPhase.SAVING,
                            percent = percent,
                            message = "Saving $filename to this phone…",
                        ),
                    )
                }
            }
            delay(900)
        }
    }

    private fun safeFilename(value: String): String =
        value.replace(Regex("""[\\/:*?\"<>|]"""), "_")
            .take(180)
            .ifBlank { "Reelhouse-video.mp4" }

    private fun uniqueFile(directory: File, filename: String): File {
        val first = File(directory, filename)
        if (!first.exists()) return first
        val extension = filename.substringAfterLast('.', "")
        val stem = if (extension.isBlank()) filename else filename.dropLast(extension.length + 1)
        var counter = 1
        while (true) {
            val suffix = if (extension.isBlank()) " ($counter)" else " ($counter).$extension"
            val candidate = File(directory, "$stem$suffix")
            if (!candidate.exists()) return candidate
            counter++
        }
    }

    class Factory(private val app: ReelhouseApp) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            YouTubeViewModel(app) as T
    }
}
