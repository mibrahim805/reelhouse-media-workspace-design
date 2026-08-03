package com.reelhouse.downloader

import android.content.Context
import androidx.core.content.ContextCompat
import com.reelhouse.downloader.data.DownloadEntity
import com.reelhouse.downloader.download.DownloadRequest
import com.reelhouse.downloader.download.DownloadService
import com.reelhouse.downloader.media.FormatInfo
import com.reelhouse.downloader.media.FormatSelector
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.media.MediaInfo
import com.reelhouse.downloader.util.UrlValidator
import com.reelhouse.downloader.youtube.YouTubeUrls
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Implements the Django API envelope used by the web frontend, but executes
 * every operation through the Android device's embedded yt-dlp/FFmpeg engine.
 */
class LocalWebBackend(private val app: ReelhouseApp) {
    private data class CachedResponse(val createdAt: Long, val body: String)
    private data class CachedInfo(val createdAt: Long, val media: MediaInfo)

    private val json = Json { ignoreUnknownKeys = true }
    private val extractor = MediaExtractor(app)
    private val dao = app.database.downloadDao()
    private val infoCache = ConcurrentHashMap<String, CachedInfo>()
    private val inFlightInfo = ConcurrentHashMap<String, CompletableDeferred<MediaInfo>>()
    private val extractionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val feedCache = ConcurrentHashMap<String, CachedResponse>()
    private val knownJobs = ConcurrentHashMap.newKeySet<String>()

    suspend fun handle(rawRequest: String): String {
        val requestStarted = SystemClock.elapsedRealtime()
        val requestId = runCatching {
            json.parseToJsonElement(rawRequest).jsonObject.string("id")
        }.getOrDefault("")

        return try {
            evictCaches()
            val request = json.parseToJsonElement(rawRequest).jsonObject
            val path = request.string("path")
                .substringAfter("/api/backend/", "")
                .trim('/')
            val body = request.string("body").takeIf(String::isNotBlank)?.let {
                json.parseToJsonElement(it).jsonObject
            } ?: JsonObject(emptyMap())
            logTiming("request=$requestId path=$path phase=received", requestStarted)

            val cacheKey = when (path) {
                "youtube-search" -> "search:${body.string("query").trim().lowercase()}"
                "youtube-topic" -> "topic:${body.string("topic").ifBlank { "All" }.lowercase()}"
                else -> null
            }
            if (cacheKey != null) {
                val cached = feedCache[cacheKey]
                if (cached != null && System.currentTimeMillis() - cached.createdAt < FEED_CACHE_TTL_MS) {
                    Log.d(TAG, "request=$requestId path=$path cache=hit durationMs=${elapsed(requestStarted)}")
                    return bridgeResponse(requestId, 200, cached.body)
                }
            }

            val (status, envelope) = when {
                path == "fetch-info" -> fetchInfo(body)
                path == "youtube-search" -> search(body)
                path == "youtube-topic" -> topic(body)
                path == "start-download" -> startDownload(body)
                path.startsWith("progress/") -> progress(path.substringAfter("progress/"))
                else -> 404 to errorEnvelope("Unknown local backend endpoint.")
            }
            val envelopeBody = envelope.toString()
            if (cacheKey != null && status == 200) {
                feedCache[cacheKey] = CachedResponse(System.currentTimeMillis(), envelopeBody)
            }
            bridgeResponse(requestId, status, envelopeBody).also {
                logTiming("request=$requestId path=$path phase=response_sent status=$status", requestStarted)
            }
        } catch (error: Exception) {
            bridgeResponse(
                requestId,
                400,
                errorEnvelope(userFacingError(error)).toString(),
            ).also { logTiming("request=$requestId phase=error durationMs=${elapsed(requestStarted)}", requestStarted) }
        }
    }

    private fun userFacingError(error: Exception): String {
        val message = error.message.orEmpty()
        val lower = message.lowercase()
        if ("empty media response" in lower || "instagram" in lower && "cookies" in lower) {
            return "Instagram did not provide this post to the downloader. The app tried to update its download engine automatically; the post must be public and accessible without an Instagram login."
        }
        return message.ifBlank { "The local Android backend failed." }
    }

    private fun evictCaches() {
        val now = System.currentTimeMillis()
        feedCache.entries.removeIf { now - it.value.createdAt >= FEED_CACHE_TTL_MS }
        while (feedCache.size > MAX_FEED_CACHE_ENTRIES) {
            feedCache.entries.minByOrNull { it.value.createdAt }?.let { feedCache.remove(it.key) } ?: break
        }
        if (infoCache.size > MAX_INFO_CACHE_ENTRIES) infoCache.clear()
    }

    private suspend fun fetchInfo(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val requestId = UUID.randomUUID().toString().take(8)
        val media = loadInfo(url, requestId)
        return 200 to buildJsonObject {
            put("ok", true)
            put("video", mediaJson(media, url, includeQualities = true))
        }
    }

    private suspend fun search(body: JsonObject): Pair<Int, JsonObject> {
        val query = body.string("query").trim()
        require(query.isNotBlank()) { "Enter a search term." }
        val started = SystemClock.elapsedRealtime()
        val operationId = "search-${UUID.randomUUID().toString().take(8)}"
        Log.d(TAG, "operation=$operationId phase=search_start query=${query.take(120)}")
        val videos = withContext(Dispatchers.IO) { extractor.searchYouTube(query, limit = 8) }
        Log.d(TAG, "operation=$operationId phase=search_finish results=${videos.size} durationMs=${elapsed(started)}")
        return 200 to buildJsonObject {
            put("ok", true)
            put("videos", mediaArray(videos))
        }
    }

    private suspend fun topic(body: JsonObject): Pair<Int, JsonObject> {
        val topic = body.string("topic").ifBlank { "All" }
        val query = topicQuery(topic)
        val started = SystemClock.elapsedRealtime()
        val operationId = "search-${UUID.randomUUID().toString().take(8)}"
        Log.d(TAG, "operation=$operationId phase=search_start topic=$topic")
        val videos = withContext(Dispatchers.IO) { extractor.searchYouTube(query, limit = 8) }
        Log.d(TAG, "operation=$operationId phase=search_finish results=${videos.size} durationMs=${elapsed(started)}")
        return 200 to buildJsonObject {
            put("ok", true)
            put("topic", topic)
            put("query", query)
            put("videos", mediaArray(videos))
        }
    }

    private suspend fun startDownload(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val quality = body.string("quality").ifBlank { "best" }
        dao.findActiveByUrl(url)?.let { active ->
            knownJobs += active.id
            return 200 to buildJsonObject {
                put("ok", true)
                put("job_id", active.id)
            }
        }

        val media = loadInfo(url, UUID.randomUUID().toString().take(8))
        val height = quality.toIntOrNull()
        val selectedFormat = media.formats
            .filter { it.hasVideo && (height == null || it.height <= height) }
            .maxByOrNull { it.height }
        val jobId = UUID.randomUUID().toString()
        val request = DownloadRequest(
            id = jobId,
            url = url,
            mediaInfo = media,
            formatSelector = FormatSelector.build(
                audioOnly = false,
                videoHeight = height,
                videoContainer = "mp4",
            ),
            isAudioOnly = false,
            mergeFormat = "mp4",
            qualityLabel = height?.let { "${it}p" } ?: "Best available",
            destination = "downloads",
            expectedBytes = selectedFormat?.effectiveFilesize ?: 0L,
        )
        knownJobs += jobId
        ContextCompat.startForegroundService(app, DownloadService.createStartIntent(app, request))

        return 200 to buildJsonObject {
            put("ok", true)
            put("job_id", jobId)
        }
    }

    private suspend fun progress(jobId: String): Pair<Int, JsonObject> {
        val item = dao.getById(jobId)
        if (item == null) {
            return if (jobId in knownJobs) {
                200 to buildJsonObject {
                    put("ok", true)
                    put("job", buildJsonObject {
                        put("status", "queued")
                        put("percent", 0)
                    })
                }
            } else {
                404 to errorEnvelope("Download job was not found.")
            }
        }

        return 200 to buildJsonObject {
            put("ok", true)
            put("job", downloadJobJson(item))
        }
    }

    private fun mediaArray(videos: List<MediaInfo>): JsonArray = buildJsonArray {
        videos.forEach { media ->
            val url = media.webpageUrl.ifBlank {
                media.id.takeIf { it.matches(YOUTUBE_ID) }
                    ?.let { "https://www.youtube.com/watch?v=$it" }
                    .orEmpty()
            }
            if (url.isNotBlank()) add(mediaJson(media, url, includeQualities = false))
        }
    }

    private fun mediaJson(
        media: MediaInfo,
        sourceUrl: String,
        includeQualities: Boolean,
    ): JsonObject = buildJsonObject {
        put("id", media.id)
        put("title", media.title)
        put("channel", media.displayUploader)
        put("duration", media.durationFormatted)
        put("thumbnail", media.thumbnail)
        put("source_url", sourceUrl)
        put("webpage_url", sourceUrl)
        put("platform", media.platform.ifBlank { "YouTube" })
        val videoId = YouTubeUrls.videoId(sourceUrl)
            ?: media.id.takeIf { it.matches(YOUTUBE_ID) }.orEmpty()
        put(
            "embed_url",
            videoId.takeIf(String::isNotBlank)
                ?.let { "https://www.youtube.com/embed/$it" }
                .orEmpty(),
        )
        put("can_embed", videoId.isNotBlank())
        if (includeQualities) put("qualities", qualitiesJson(media.formats))
    }

    private fun qualitiesJson(formats: List<FormatInfo>): JsonArray = buildJsonArray {
        formats.asSequence()
            .filter { it.hasVideo && it.height > 0 }
            .groupBy { it.height }
            .map { (height, choices) ->
                height to choices.maxByOrNull { it.effectiveFilesize }
            }
            .sortedByDescending { it.first }
            .take(8)
            .forEach { (height, format) ->
                add(buildJsonObject {
                    put("value", height.toString())
                    put("label", "${height}p")
                    put("extension", format?.ext?.ifBlank { "mp4" } ?: "mp4")
                    put("filesize_label", format?.filesizeFormatted ?: "Unknown size")
                })
            }
    }

    private fun downloadJobJson(item: DownloadEntity): JsonObject = buildJsonObject {
        val publicStatus = when (item.status) {
            DownloadEntity.Status.COMPLETE -> "complete"
            DownloadEntity.Status.FAILED, DownloadEntity.Status.CANCELLED -> "error"
            DownloadEntity.Status.PROCESSING -> "processing"
            DownloadEntity.Status.DOWNLOADING -> "downloading"
            else -> "queued"
        }
        put("status", publicStatus)
        put("percent", (item.progress * 100).toInt().coerceIn(0, 100))
        put("speed", item.speedBytesPerSec)
        put("eta", item.etaSeconds)
        item.errorMessage?.let { put("error", it) }
        if (item.status == DownloadEntity.Status.COMPLETE) {
            put("result", buildJsonObject {
                put("title", item.title)
                put(
                    "filename",
                    item.savedDisplayName.ifBlank { "${item.title}.${item.fileExtension}" },
                )
                put("file_url", "reelhouse-local://${item.id}")
                put("filesize_mb", item.fileSizeBytes / (1024.0 * 1024.0))
                put("source_url", item.url)
            })
        }
    }

    private fun validatedUrl(rawUrl: String): String {
        val result = UrlValidator.validate(rawUrl)
        require(result is UrlValidator.ValidationResult.Valid) {
            (result as UrlValidator.ValidationResult.Invalid).reason
        }
        return result.url
    }

    private suspend fun loadInfo(url: String, operationId: String): MediaInfo {
        val started = SystemClock.elapsedRealtime()
        val key = stableInfoKey(url)
        val cached = infoCache[key]
        if (cached != null && System.currentTimeMillis() - cached.createdAt < INFO_CACHE_TTL_MS) {
            Log.d(TAG, "operation=$operationId key=$key cache=hit lookupMs=${elapsed(started)}")
            return cached.media
        }
        Log.d(TAG, "operation=$operationId key=$key cache=miss lookupMs=${elapsed(started)}")

        val deferred = synchronized(inFlightInfo) {
            inFlightInfo[key] ?: CompletableDeferred<MediaInfo>().also { created ->
                inFlightInfo[key] = created
                extractionScope.launch {
                    val extractionStarted = SystemClock.elapsedRealtime()
                    Log.d(TAG, "operation=$operationId key=$key extraction=start")
                    try {
                        val media = withContext(Dispatchers.IO) { extractor.extractInfo(url) }
                        infoCache[key] = CachedInfo(System.currentTimeMillis(), media)
                        created.complete(media)
                        Log.d(TAG, "operation=$operationId key=$key extraction=finish durationMs=${elapsed(extractionStarted)}")
                    } catch (error: Throwable) {
                        created.completeExceptionally(error)
                        Log.d(TAG, "operation=$operationId key=$key extraction=error durationMs=${elapsed(extractionStarted)}")
                    } finally {
                        inFlightInfo.remove(key, created)
                    }
                }
            }
        }
        if (deferred !== inFlightInfo[key]) {
            Log.d(TAG, "operation=$operationId key=$key duplicate=coalesced")
        }
        return deferred.await()
    }

    private fun stableInfoKey(url: String): String {
        val videoId = YouTubeUrls.videoId(url)
        return if (!videoId.isNullOrBlank()) "youtube:$videoId" else "url:${url.trim().lowercase()}"
    }

    private fun elapsed(started: Long): Long = SystemClock.elapsedRealtime() - started

    private fun logTiming(message: String, started: Long) {
        Log.d(TAG, "$message durationMs=${elapsed(started)}")
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
        else -> error("Unknown topic.")
    }

    private fun errorEnvelope(message: String) = buildJsonObject {
        put("ok", false)
        put("error", message)
    }

    private fun bridgeResponse(id: String, status: Int, body: String): String =
        buildJsonObject {
            put("id", id)
            put("status", status)
            put("body", body)
        }.toString()

    private fun JsonObject.string(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull.orEmpty()

    private companion object {
        const val FEED_CACHE_TTL_MS = 5 * 60 * 1000L
        const val MAX_FEED_CACHE_ENTRIES = 24
        const val MAX_INFO_CACHE_ENTRIES = 32
        const val INFO_CACHE_TTL_MS = 15 * 60 * 1000L
        const val TAG = "ReelhousePerf"
        private val YOUTUBE_ID = Regex("""^[A-Za-z0-9_-]{11}$""")
    }
}
