package com.reelhouse.downloader.youtube

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.reelhouse.downloader.ReelhouseApp
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.media.MediaInfo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import android.os.SystemClock

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
) : AndroidViewModel(application) {
    private val extractor = MediaExtractor(application)
    private val _state = MutableStateFlow(YouTubeState())
    val state: StateFlow<YouTubeState> = _state.asStateFlow()

    private var browseJob: Job? = null
    private var watchJob: Job? = null
    private val resultCache = mutableMapOf<String, Pair<Long, List<BackendVideo>>>()

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
                val cacheKey = "topic:${topic.lowercase()}"
                val cached = resultCache[cacheKey]
                    ?.takeIf { SystemClock.elapsedRealtime() - it.first < 600_000L }
                    ?.second
                val videos = cached ?: extractor.searchYouTube(topicQuery(topic), limit = 8)
                    .map(::localVideo).also { resultCache[cacheKey] = SystemClock.elapsedRealtime() to it }
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
                val cacheKey = "search:${cleaned.lowercase()}"
                val cached = resultCache[cacheKey]
                    ?.takeIf { SystemClock.elapsedRealtime() - it.first < 600_000L }
                    ?.second
                val videos = cached ?: extractor.searchYouTube(cleaned, limit = 8)
                    .map(::localVideo).also { resultCache[cacheKey] = SystemClock.elapsedRealtime() to it }
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
                val loaded = localVideo(extractor.extractInfo(fallback.sourceUrl))
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
                        watchError = null,
                    )
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        watchLoading = false,
                        watchError = error.message ?: "This phone could not load download qualities.",
                    )
                }
            }
        }
    }

    fun setQuality(value: String) {
        _state.update { it.copy(selectedQuality = value) }
    }

    fun startLocalDownload() {
        val video = _state.value.selectedVideo ?: return
        if (_state.value.download.phase in setOf(
                BackendDownloadPhase.STARTING,
                BackendDownloadPhase.DOWNLOADING,
                BackendDownloadPhase.PROCESSING,
                BackendDownloadPhase.SAVING,
            )
        ) return

        val quality = _state.value.selectedQuality.ifBlank { "best" }
        _state.update {
            it.copy(
                download = BackendDownloadState(
                    phase = BackendDownloadPhase.STARTING,
                    message = "Starting download on this phone…",
                ),
                localFallback = LocalDownloadFallback(
                    token = System.nanoTime(),
                    video = video,
                    quality = quality,
                ),
            )
        }
    }

    fun consumeLocalFallback() {
        _state.update { it.copy(localFallback = null, download = BackendDownloadState()) }
    }

    fun clearDownloadStatus() {
        _state.update { it.copy(download = BackendDownloadState()) }
    }

    private fun topicQuery(topic: String): String = when (topic) {
        "All" -> "popular videos Pakistan"
        "Music" -> "latest music videos"
        "Pakistani dramas" -> "Pakistani dramas latest episode"
        "News" -> "latest Pakistan news"
        "T-Series" -> "T-Series latest songs"
        "Atif Aslam" -> "Atif Aslam songs"
        "Gaming" -> "gaming videos"
        "Mixes" -> "music mixes"
        "Live" -> "live streams"
        else -> topic
    }

    private fun localVideo(media: MediaInfo): BackendVideo {
        val qualities = media.formats
            .asSequence()
            .filter { it.hasVideo && it.height > 0 }
            .groupBy { it.height }
            .map { (height, formats) ->
                val largest = formats.maxByOrNull { it.effectiveFilesize }
                BackendQuality(
                    value = height.toString(),
                    label = "${height}p",
                    extension = largest?.ext?.ifBlank { "mp4" } ?: "mp4",
                    sizeLabel = largest?.filesizeFormatted ?: "Unknown size",
                )
            }
            .sortedByDescending { it.value.toIntOrNull() ?: 0 }
            .take(8)

        return BackendVideo(
            id = media.id.ifBlank { YouTubeUrls.videoId(media.webpageUrl).orEmpty() },
            title = media.title,
            channel = media.displayUploader,
            duration = media.durationFormatted,
            thumbnail = media.thumbnail,
            sourceUrl = media.webpageUrl.ifBlank {
                YouTubeUrls.watchUrl(media.id).orEmpty()
            },
            platform = media.platform.ifBlank { "YouTube" },
            qualities = qualities,
        )
    }


    class Factory(private val app: ReelhouseApp) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            YouTubeViewModel(app) as T
    }
}
