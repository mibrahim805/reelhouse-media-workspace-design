package com.reelhouse.downloader.media

import android.content.Context
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
        awaitEngine()
        val request = YoutubeDLRequest(url).apply {
            addOption("--dump-single-json")
            addOption("--no-download")
            addOption("--no-playlist")
            addOption("--no-warnings")
            addOption("--no-config")
            addOption("--socket-timeout", "30")
            addYouTubeClient()
        }

        val response = YoutubeDL.getInstance().execute(request)
        val jsonStr = response.out

        if (jsonStr.isNullOrBlank()) {
            throw Exception("No information could be extracted from this URL")
        }

        parseMediaInfo(jsonStr)
    }

    /**
     * Searches YouTube through the embedded yt-dlp runtime. The request and
     * response stay on this Android device; the Reelhouse host is not used.
     */
    suspend fun searchYouTube(query: String, limit: Int = 12): List<MediaInfo> =
        withContext(Dispatchers.IO) {
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
                addOption("--socket-timeout", "30")
                addYouTubeClient()
            }
            val response = YoutubeDL.getInstance().execute(request)
            val output = response.out
            if (output.isNullOrBlank()) return@withContext emptyList()

            val root = json.parseToJsonElement(output).jsonObject
            root["entries"]?.jsonArray?.mapNotNull { element ->
                runCatching { parseSearchResult(element.jsonObject) }.getOrNull()
            }.orEmpty()
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
        val request = YoutubeDLRequest(url).apply {
            addOption("-f", formatSelector)
            addOption("-o", outputPath)
            addOption("--no-playlist")
            addOption("--no-warnings")
            addOption("--no-config")
            addOption("--retries", "3")
            addOption("--fragment-retries", "3")
            addOption("--socket-timeout", "30")
            addYouTubeClient()
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

        YoutubeDL.getInstance().execute(request, processId) { progress, eta, line ->
            onProgress(progress, eta.toLong(), line ?: "")
        }
    }

    /**
     * The official yt-dlp guidance currently lists web_embedded as a YouTube
     * client whose media requests do not require a GVS PO token. Reelhouse only
     * supports public embeddable videos, so this avoids the token-related 403
     * responses produced by the default Android/web clients.
     */
    private fun YoutubeDLRequest.addYouTubeClient() {
        addOption("--extractor-args", "youtube:player_client=web_embedded")
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
