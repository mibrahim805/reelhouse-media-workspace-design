package com.reelhouse.downloader

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.reelhouse.downloader.data.DownloadEntity
import com.reelhouse.downloader.download.DownloadRequest
import com.reelhouse.downloader.download.DownloadService
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.media.MediaInfo
import com.reelhouse.downloader.media.YtDlpUpdater
import com.reelhouse.downloader.storage.FileManager
import com.reelhouse.downloader.util.SourcePlatform
import com.reelhouse.downloader.storage.FileSanitizer
import com.reelhouse.downloader.util.ErrorClassifier
import com.reelhouse.downloader.util.NetworkUtil
import com.reelhouse.downloader.util.UrlValidator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

data class AnalysisState(
    val url: String = "",
    val loading: Boolean = false,
    val media: MediaInfo? = null,
    val error: String? = null,
)

data class SettingsState(
    val videoQuality: String = "best",
    val audioQuality: String = "best",
    val downloadType: String = "video",
    val wifiOnly: Boolean = false,
    val notifications: Boolean = true,
    val directory: String = "downloads",
)

sealed interface EngineUpdateState {
    data object Idle : EngineUpdateState
    data object Updating : EngineUpdateState
    data class Done(val message: String) : EngineUpdateState
    data class Failed(val message: String) : EngineUpdateState
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as ReelhouseApp
    private val dao = app.database.downloadDao()
    private val preferences = app.preferences
    private val extractor = MediaExtractor(app)
    private val fileManager = FileManager(app)
    private val updater = YtDlpUpdater(app)

    private val _analysis = MutableStateFlow(AnalysisState(error = app.engineError))
    val analysis: StateFlow<AnalysisState> = _analysis

    private val _updateState = MutableStateFlow<EngineUpdateState>(EngineUpdateState.Idle)
    val updateState: StateFlow<EngineUpdateState> = _updateState
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages

    val downloads = dao.getAllDownloads().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList(),
    )
    val activeDownloads = dao.getActiveDownloads().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList(),
    )
    val history = dao.getCompletedDownloads().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList(),
    )
    val recentDownloads = dao.getRecentCompleted().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList(),
    )

    val settings = combine(
        preferences.defaultVideoQuality,
        preferences.defaultAudioQuality,
        preferences.defaultDownloadType,
        preferences.wifiOnly,
        preferences.notificationsEnabled,
        preferences.downloadDirectory,
    ) { values ->
        SettingsState(
            videoQuality = values[0] as String,
            audioQuality = values[1] as String,
            downloadType = values[2] as String,
            wifiOnly = values[3] as Boolean,
            notifications = values[4] as Boolean,
            directory = values[5] as String,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsState())

    fun setUrl(url: String) {
        _analysis.value = _analysis.value.copy(url = url, error = null)
    }

    fun clearUrl() {
        _analysis.value = AnalysisState()
    }

    fun acceptSharedText(text: String?) {
        if (!text.isNullOrBlank()) setUrl(text.trim())
    }

    fun analyze() {
        val rawUrl = _analysis.value.url
        viewModelScope.launch {
            _analysis.value = _analysis.value.copy(loading = true, error = null, media = null)
            val validation = withContext(Dispatchers.IO) { UrlValidator.validate(rawUrl) }
            if (validation is UrlValidator.ValidationResult.Invalid) {
                _analysis.value = _analysis.value.copy(loading = false, error = validation.reason)
                return@launch
            }
            if (!NetworkUtil.isOnline(app)) {
                _analysis.value = _analysis.value.copy(loading = false, error = "No validated network connection is available.")
                return@launch
            }
            try {
                val url = (validation as UrlValidator.ValidationResult.Valid).url
                val media = extractor.extractInfo(url)
                if (media.formats.isEmpty()) error("No downloadable formats were found")
                _analysis.value = AnalysisState(url = url, media = media)
            } catch (error: Exception) {
                val type = ErrorClassifier.classify(error)
                _analysis.value = _analysis.value.copy(
                    loading = false,
                    error = app.getString(type.messageResId),
                )
            }
        }
    }

    fun startDownload(
        media: MediaInfo,
        audioOnly: Boolean,
        height: Int?,
        audioBitrate: Int?,
        outputFormat: String,
        qualityLabel: String,
        expectedBytes: Long,
    ): String? {
        val validation = UrlValidator.validateSyntax(_analysis.value.url)
        if (validation !is UrlValidator.ValidationResult.Valid) {
            _analysis.value = _analysis.value.copy(error = (validation as UrlValidator.ValidationResult.Invalid).reason)
            return null
        }
        if (settings.value.wifiOnly && !NetworkUtil.isOnWifi(app)) {
            _analysis.value = _analysis.value.copy(error = "Wi-Fi-only downloads are enabled. Connect to Wi-Fi and retry.")
            return null
        }
        if (activeDownloads.value.any { it.url == validation.url }) {
            _messages.tryEmit("This URL already has an active download.")
            return null
        }

        val safeFormat = if (audioOnly) {
            outputFormat.takeIf { it in setOf("m4a", "mp3", "opus") } ?: "m4a"
        } else {
            outputFormat.takeIf { it in setOf("mp4", "mkv", "webm") } ?: "mp4"
        }
        val id = UUID.randomUUID().toString()
        val request = DownloadRequest(
            id = id,
            url = validation.url,
            mediaInfo = media,
            formatSelector = extractor.buildFormatSelector(
                audioOnly,
                height,
                audioBitrate,
                safeFormat,
            ),
            isAudioOnly = audioOnly,
            mergeFormat = safeFormat,
            qualityLabel = qualityLabel,
            destination = if (SourcePlatform.isYouTube(media.webpageUrl) || media.platform.equals("YouTube", true)) {
                settings.value.directory
            } else {
                // Gallery apps index MediaStore.Video, not every Downloads
                // provider. Keep non-YouTube videos visible in the gallery.
                "media"
            },
            audioBitrate = audioBitrate,
            expectedBytes = expectedBytes.coerceAtLeast(0L),
        )
        ContextCompat.startForegroundService(app, DownloadService.createStartIntent(app, request))
        return id
    }

    fun startDirectVideoDownload(
        url: String,
        sourceId: String,
        title: String,
        uploader: String,
        thumbnail: String,
        quality: String,
    ): String? {
        val validation = UrlValidator.validateSyntax(url)
        if (validation !is UrlValidator.ValidationResult.Valid) {
            _messages.tryEmit((validation as UrlValidator.ValidationResult.Invalid).reason)
            return null
        }
        if (settings.value.wifiOnly && !NetworkUtil.isOnWifi(app)) {
            _messages.tryEmit("Wi-Fi-only downloads are enabled. Connect to Wi-Fi and retry.")
            return null
        }
        if (activeDownloads.value.any { it.url == validation.url }) {
            _messages.tryEmit("This URL already has an active download.")
            return null
        }

        val height = quality.toIntOrNull()
        val id = UUID.randomUUID().toString()
        val request = DownloadRequest(
            id = id,
            url = validation.url,
            mediaInfo = MediaInfo(
                id = sourceId,
                title = title,
                uploader = uploader,
                thumbnail = thumbnail,
                platform = "YouTube",
                webpageUrl = validation.url,
            ),
            formatSelector = extractor.buildFormatSelector(
                isAudioOnly = false,
                videoHeight = height,
                audioBitrate = null,
                videoContainer = "mp4",
            ),
            isAudioOnly = false,
            mergeFormat = "mp4",
            qualityLabel = height?.let { "${it}p" } ?: "Best available",
            destination = settings.value.directory,
            expectedBytes = 0,
        )
        ContextCompat.startForegroundService(app, DownloadService.createStartIntent(app, request))
        _messages.tryEmit("Download started locally on this phone.")
        return id
    }

    fun cancelDownload(id: String) {
        app.startService(DownloadService.createCancelIntent(app, id))
    }

    fun retryDownload(item: DownloadEntity) {
        val request = DownloadRequest(
            // Keep the original job ID so yt-dlp uses the same deterministic
            // temporary output path and the existing partial file can resume.
            id = item.id,
            url = item.url,
            mediaInfo = MediaInfo(
                id = item.sourceId,
                title = item.title,
                uploader = item.uploader,
                thumbnail = item.thumbnail,
                platform = item.platform,
                webpageUrl = item.url,
            ),
            formatSelector = item.formatSelector.ifBlank { "best" },
            isAudioOnly = item.isAudioOnly,
            mergeFormat = item.fileExtension,
            qualityLabel = item.formatLabel,
            destination = item.destination,
            audioBitrate = item.audioBitrate,
            expectedBytes = item.totalBytes,
        )
        ContextCompat.startForegroundService(app, DownloadService.createStartIntent(app, request))
    }

    fun removeHistory(item: DownloadEntity) = viewModelScope.launch { dao.delete(item) }

    fun clearHistory() = viewModelScope.launch { dao.clearHistory() }

    fun deleteFile(item: DownloadEntity) = viewModelScope.launch {
        val uri = item.contentUri?.let(Uri::parse)
        if (uri == null) {
            _messages.emit("The saved file location is unavailable.")
            return@launch
        }
        val deleted = withContext(Dispatchers.IO) { fileManager.deleteFile(uri) }
        if (deleted) {
            dao.delete(item)
        } else {
            _messages.emit("The file could not be deleted. It may already have been moved or removed.")
        }
    }

    fun open(item: DownloadEntity): Intent? = item.contentUri?.let {
        fileManager.createOpenIntent(Uri.parse(it), item.mimeType)
    }

    fun share(item: DownloadEntity): Intent? = item.contentUri?.let {
        fileManager.createShareIntent(Uri.parse(it), item.mimeType, item.title)
    }

    fun reportFileActionFailure() {
        _messages.tryEmit("No compatible app could open that file, or the file is no longer available.")
    }

    fun filenamePreview(media: MediaInfo, extension: String): String =
        FileSanitizer.sanitize("${media.title}.${extension.lowercase()}")

    fun setVideoQuality(value: String) = viewModelScope.launch { preferences.setDefaultVideoQuality(value) }
    fun setAudioQuality(value: String) = viewModelScope.launch { preferences.setDefaultAudioQuality(value) }
    fun setDownloadType(value: String) = viewModelScope.launch { preferences.setDefaultDownloadType(value) }
    fun setWifiOnly(value: Boolean) = viewModelScope.launch { preferences.setWifiOnly(value) }
    fun setNotifications(value: Boolean) = viewModelScope.launch { preferences.setNotificationsEnabled(value) }
    fun setDirectory(value: String) = viewModelScope.launch { preferences.setDownloadDirectory(value) }

    fun updateEngine() {
        if (_updateState.value == EngineUpdateState.Updating) return
        viewModelScope.launch {
            _updateState.value = EngineUpdateState.Updating
            _updateState.value = when (val result = updater.update()) {
                is YtDlpUpdater.UpdateResult.Updated -> EngineUpdateState.Done("Updated to ${result.version}")
                YtDlpUpdater.UpdateResult.AlreadyLatest -> EngineUpdateState.Done("Already up to date")
                is YtDlpUpdater.UpdateResult.Failed -> EngineUpdateState.Failed(result.message)
            }
        }
    }

    fun restoreBundledEngine() {
        if (_updateState.value == EngineUpdateState.Updating) return
        viewModelScope.launch {
            _updateState.value = EngineUpdateState.Updating
            _updateState.value = when (val result = updater.restoreBundled()) {
                is YtDlpUpdater.UpdateResult.Updated -> EngineUpdateState.Done("Bundled engine restored")
                YtDlpUpdater.UpdateResult.AlreadyLatest -> EngineUpdateState.Done("Bundled engine is active")
                is YtDlpUpdater.UpdateResult.Failed -> EngineUpdateState.Failed(result.message)
            }
        }
    }

    suspend fun currentEngineVersion(): String = updater.currentVersion()

    class Factory(private val app: ReelhouseApp) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = AppViewModel(app) as T
    }
}
