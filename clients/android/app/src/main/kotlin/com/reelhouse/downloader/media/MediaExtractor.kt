package com.reelhouse.downloader.media

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.reelhouse.downloader.ReelhouseApp
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.float
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull

/**
 * Wraps youtubedl-android to extract media information and download files.
 *
 * All operations run on Dispatchers.IO. The yt-dlp Python runtime is
 * embedded inside the APK via youtubedl-android and never exposed to the user.
 *
 * SECURITY: Arguments are built from an internal whitelist.
 * No shell concatenation. No user-provided flags.
 */
class MediaExtractor(private val context: Context) {

    private companion object {
        const val TAG = "ReelhousePerf"
        private var callCount = 0L
        @Synchronized fun nextCall(): Long = ++callCount
    }

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    /**
     * Extracts metadata and available formats for a URL.
     * Runs entirely on the device — no Railway server contact.
     */
    suspend fun extractInfo(url: String): MediaInfo = withContext(Dispatchers.IO) {
        val call = nextCall()
        val started = SystemClock.elapsedRealtime()
        Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_STARTED number=$call type=info thread=${Thread.currentThread().name} url=${url.take(180)}")
        awaitEngine()
        val engineReadyAt = SystemClock.elapsedRealtime()
        val request = YoutubeDLRequest(url).apply {
            addOption("--dump-single-json")
            addOption("--no-download")
            addOption("--no-playlist")
            addOption("--no-warnings")
            addOption("--no-config")
            // Metadata extraction should fail fast instead of spending the
            // default retry budget on a blocked or unavailable extractor.
            addOption("--retries", "1")
            addOption("--extractor-retries", "1")
            addOption("--fragment-retries", "1")
            addOption("--socket-timeout", "30")
        }

        Log.d(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_INFO_ENGINE_READY number=$call waitMs=${engineReadyAt - started}")
        val processStarted = SystemClock.elapsedRealtime()
        val response = executeWithEngineRecovery {
            YoutubeDL.getInstance().execute(request)
        }
        Log.d(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_INFO_PROCESS_FINISHED number=$call processMs=${SystemClock.elapsedRealtime() - processStarted}")
        val jsonStr = response.out

        if (jsonStr.isNullOrBlank()) {
            throw Exception("No information could be extracted from this URL")
        }

        parseMediaInfo(jsonStr).also {
            Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_FINISHED number=$call type=info durationMs=${SystemClock.elapsedRealtime() - started}")
        }
    }

    /**
     * Fast format-manifest attempt. Some YouTube clients return the player
     * formats with less negotiation than the default extractor. Callers must
     * validate the returned formats and fall back to extractInfo when empty.
     */
    suspend fun extractInfoFast(url: String): MediaInfo = withContext(Dispatchers.IO) {
        val call = nextCall()
        val started = SystemClock.elapsedRealtime()
        Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_STARTED number=$call type=fast-info thread=${Thread.currentThread().name}")
        awaitEngine()
        val request = YoutubeDLRequest(url).apply {
            addOption("--dump-single-json")
            addOption("--no-download")
            addOption("--no-playlist")
            addOption("--no-warnings")
            addOption("--no-config")
            addOption("--retries", "1")
            addOption("--extractor-retries", "1")
            addOption("--socket-timeout", "15")
            addOption("--extractor-args", "youtube:player_client=android")
        }
        val response = YoutubeDL.getInstance().execute(request)
        val output = response.out
        if (output.isNullOrBlank()) error("No information could be extracted")
        parseMediaInfo(output).also {
            Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_FINISHED number=$call type=fast-info formats=${it.formats.size} durationMs=${SystemClock.elapsedRealtime() - started}")
        }
    }

    /**
     * Searches YouTube through the embedded yt-dlp runtime. The request and
     * response stay on this Android device; the Reelhouse host is not used.
     */
    suspend fun searchYouTube(query: String, limit: Int = 12): List<MediaInfo> =
        withContext(Dispatchers.IO) {
            val call = nextCall()
            val started = SystemClock.elapsedRealtime()
            Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_STARTED number=$call type=search query=${query.take(120)} thread=${Thread.currentThread().name}")
            val cleanedQuery = query.trim().replace(Regex("""[\r\n]+"""), " ").take(120)
            require(cleanedQuery.isNotBlank()) { "Enter a search term." }
            val safeLimit = limit.coerceIn(1, 20)

            awaitEngine()
            val request = YoutubeDLRequest("ytsearch$safeLimit:$cleanedQuery").apply {
                addOption("--dump-single-json")
                addOption("--flat-playlist")
                addOption("--skip-download")
                addOption("--no-warnings")
                addOption("--no-config")
                addOption("--retries", "1")
                addOption("--socket-timeout", "15")
            }
            val response = executeWithEngineRecovery {
                YoutubeDL.getInstance().execute(request)
            }
            val output = response.out
            if (output.isNullOrBlank()) return@withContext emptyList()

            val root = json.parseToJsonElement(output).jsonObject
            root["entries"]?.jsonArray?.mapNotNull { element ->
                runCatching { parseSearchResult(element.jsonObject) }.getOrNull()
            }.orEmpty().also {
                Log.i(TAG, "PERF_BUILD_ID=${com.reelhouse.downloader.BuildConfig.PERF_BUILD_ID} YTDLP_CALL_FINISHED number=$call type=search results=${it.size} durationMs=${SystemClock.elapsedRealtime() - started}")
            }
        }


    /**
     * Downloads media to the specified output path.
     * Reports progress via callback.
     *
     * @param url The media URL
     * @param formatSelector yt-dlp format string (e.g., "bestvideo[height<=720]+bestaudio/best")
     * @param outputPath Full path for the output file (in app-private temp dir)
     * @param onProgress Callback with (progress 0-100, etaSeconds, logLine)
     */
    suspend fun download(
        url: String,
        formatSelector: String,
        outputPath: String,
        processId: String,
        audioOnly: Boolean = false,
        audioBitrate: Int? = null,
        mergeFormat: String = "mp4",
        onProgress: (Float, Long, String) -> Unit = { _, _, _ -> },
    ) = withContext(Dispatchers.IO) {
        awaitEngine()
        fun request(playerClient: String? = null) = YoutubeDLRequest(url).apply {
            addDownloadOptions(
                formatSelector = formatSelector,
                outputPath = outputPath,
                audioOnly = audioOnly,
                audioBitrate = audioBitrate,
                mergeFormat = mergeFormat,
            )
            playerClient?.let {
                addOption("--extractor-args", "youtube:player_client=$it")
            }
        }

        fun execute(downloadRequest: YoutubeDLRequest) = YoutubeDL.getInstance().execute(
            downloadRequest,
            processId,
        ) { progress, eta, line ->
            onProgress(progress, eta.toLong(), line ?: "")
        }

        try {
            executeWithEngineRecovery { execute(request()) }
        } catch (error: Exception) {
            if (!url.isYouTubeUrl() || !isClientAccessFailure(error)) throw error
            Log.w(
                TAG,
                "YTDLP_DOWNLOAD_RETRY client_access client=web_embedded process=$processId",
            )
            executeWithEngineRecovery { execute(request("web_embedded")) }
        }
    }

    private fun YoutubeDLRequest.addDownloadOptions(
        formatSelector: String,
        outputPath: String,
        audioOnly: Boolean,
        audioBitrate: Int?,
        mergeFormat: String,
    ) {
        addOption("-f", formatSelector)
        addOption("-o", outputPath)
        addOption("--no-playlist")
        addOption("--no-warnings")
        addOption("--no-config")
        addOption("--retries", "3")
        addOption("--fragment-retries", "3")
        addOption("--socket-timeout", "30")
        if (audioOnly) {
            addOption("--extract-audio")
            addOption("--audio-format", mergeFormat)
            addOption(
                "--audio-quality",
                FormatSelector.safeAudioBitrate(audioBitrate)?.let { "${it}K" } ?: "0",
            )
        } else {
            addOption("--merge-output-format", mergeFormat)
            addOption("--remux-video", mergeFormat)
        }
        addOption("--restrict-filenames")
    }

    private fun String.isYouTubeUrl(): Boolean = runCatching {
        val host = android.net.Uri.parse(this).host.orEmpty().lowercase()
        host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
    }.getOrDefault(false)

    private fun isClientAccessFailure(error: Throwable): Boolean =
        isYouTubeClientAccessFailure(error.message.orEmpty())

    private suspend fun <T> executeWithEngineRecovery(operation: () -> T): T {
        return try {
            operation()
        } catch (error: Exception) {
            if (!needsEngineRecovery(error)) throw error

            when (YtDlpUpdater(context).update()) {
                is YtDlpUpdater.UpdateResult.Updated,
                YtDlpUpdater.UpdateResult.AlreadyLatest -> operation()
                is YtDlpUpdater.UpdateResult.Failed -> throw error
            }
        }
    }

    private fun needsEngineRecovery(error: Throwable): Boolean {
        val message = (error.message ?: "").lowercase()
        return "empty media response" in message ||
            "confirm you are on the latest version" in message ||
            "no video formats found" in message
    }

    /**
     * Builds a yt-dlp format selector string from user choices.
     * Uses an internal whitelist — never accepts raw user input.
     */
    fun buildFormatSelector(
        isAudioOnly: Boolean,
        videoHeight: Int? = null,
        audioBitrate: Int? = null,
        videoContainer: String = "mp4",
    ): String {
        return FormatSelector.build(isAudioOnly, videoHeight, audioBitrate, videoContainer)
    }

    private suspend fun awaitEngine() {
        (context.applicationContext as? ReelhouseApp)?.awaitEngineReady()
            ?: YoutubeDL.getInstance().init(context.applicationContext)
    }

    private fun parseMediaInfo(jsonStr: String): MediaInfo {
        val obj = json.parseToJsonElement(jsonStr).jsonObject

        val formats = obj["formats"]?.jsonArray?.mapNotNull { element ->
            try {
                val fmt = element.jsonObject
                FormatInfo(
                    formatId = fmt.str("format_id"),
                    ext = fmt.str("ext"),
                    resolution = fmt.str("resolution"),
                    height = fmt.intOrZero("height"),
                    width = fmt.intOrZero("width"),
                    fps = fmt.floatOrZero("fps").toDouble(),
                    vcodec = fmt.str("vcodec", "none"),
                    acodec = fmt.str("acodec", "none"),
                    abr = fmt.floatOrZero("abr").toDouble(),
                    filesize = fmt.longOrZero("filesize"),
                    filesizeApprox = fmt.longOrZero("filesize_approx"),
                    formatNote = fmt.str("format_note"),
                )
            } catch (_: Exception) {
                null
            }
        } ?: emptyList()

        return MediaInfo(
            id = obj.str("id"),
            title = obj.str("title", "Untitled"),
            uploader = obj.str("uploader"),
            channel = obj.str("channel"),
            duration = obj.longOrZero("duration"),
            thumbnail = obj.str("thumbnail"),
            platform = obj.str("extractor_key").ifBlank {
                obj.str("extractor").ifBlank { "Video" }
            },
            webpageUrl = obj.str("webpage_url"),
            formats = formats,
        )
    }

    private fun parseSearchResult(obj: JsonObject): MediaInfo {
        val id = obj.str("id")
        val rawUrl = obj.str("webpage_url").ifBlank { obj.str("url") }
        val webpageUrl = when {
            rawUrl.startsWith("https://") -> rawUrl
            id.matches(Regex("""^[A-Za-z0-9_-]{11}$""")) ->
                "https://www.youtube.com/watch?v=$id"
            else -> ""
        }
        return MediaInfo(
            id = id,
            title = obj.str("title", "Untitled"),
            uploader = obj.str("uploader"),
            channel = obj.str("channel"),
            duration = obj.longOrZero("duration"),
            thumbnail = obj.str("thumbnail").ifBlank {
                id.takeIf { it.matches(Regex("""^[A-Za-z0-9_-]{11}$""")) }
                    ?.let { "https://i.ytimg.com/vi/$it/hqdefault.jpg" }
                    .orEmpty()
            },
            platform = "YouTube",
            webpageUrl = webpageUrl,
        )
    }


    // JSON helper extensions
    private fun JsonObject.str(key: String, default: String = ""): String =
        this[key]?.jsonPrimitive?.content ?: default

    private fun JsonObject.intOrZero(key: String): Int =
        try { this[key]?.jsonPrimitive?.int ?: 0 } catch (_: Exception) { 0 }

    private fun JsonObject.floatOrZero(key: String): Float =
        try { this[key]?.jsonPrimitive?.float ?: 0f } catch (_: Exception) { 0f }

    private fun JsonObject.longOrZero(key: String): Long =
        try { this[key]?.jsonPrimitive?.longOrNull ?: 0L } catch (_: Exception) { 0L }
}

/* Error 152 is a YouTube client-access response, not proof of private content. */
internal fun isYouTubeClientAccessFailure(message: String): Boolean {
    val lower = message.lowercase()
    return "http error 403" in lower ||
        "403 forbidden" in lower ||
        "access denied" in lower ||
        "denied by the source" in lower ||
        "source denied" in lower ||
        "error code: 152" in lower ||
        "watch video on youtube" in lower
}
