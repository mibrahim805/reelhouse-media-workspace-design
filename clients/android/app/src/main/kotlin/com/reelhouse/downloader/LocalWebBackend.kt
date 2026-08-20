package com.reelhouse.downloader

import android.content.Context
import androidx.core.content.ContextCompat
import com.reelhouse.downloader.data.DownloadEntity
import com.reelhouse.downloader.download.DownloadRequest
import com.reelhouse.downloader.download.outputFormatFor
import com.reelhouse.downloader.download.DownloadService
import com.reelhouse.downloader.media.FormatInfo
import com.reelhouse.downloader.media.FormatSelector
import com.reelhouse.downloader.media.MediaExtractor
import com.reelhouse.downloader.media.MediaInfo
import com.reelhouse.downloader.util.ErrorClassifier
import com.reelhouse.downloader.util.SourcePlatform
import com.reelhouse.downloader.util.UrlValidator
import com.reelhouse.downloader.youtube.YouTubeUrls
import com.reelhouse.downloader.youtube.BackendVideo
import com.reelhouse.downloader.youtube.BackendRequestException
import com.reelhouse.downloader.youtube.ReelhouseBackend
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import android.os.SystemClock
import android.util.Log
import android.net.Uri
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
    private enum class PreparationStatus { IDLE, PREPARING, READY, FAILED }

    private data class CachedResponse(val createdAt: Long, val body: String)
    private data class CachedInfo(val createdAt: Long, val media: MediaInfo)
    private data class PreparingJob(val url: String, val quality: String, val error: String? = null)
    private data class VideoPreparation(
        val videoKey: String,
        val url: String,
        val status: PreparationStatus = PreparationStatus.IDLE,
        val media: MediaInfo? = null,
        val pendingQuality: String? = null,
        val pendingJobId: String? = null,
        val error: String? = null,
        val startedAt: Long = 0L,
        val completedAt: Long = 0L,
        val downloadStarted: Boolean = false,
    )

    private val json = Json { ignoreUnknownKeys = true }
    private val extractor = MediaExtractor(app)
    private val remoteBackend = ReelhouseBackend()
    private val dao = app.database.downloadDao()
    private val infoCache = ConcurrentHashMap<String, CachedInfo>()
    private val inFlightInfo = ConcurrentHashMap<String, CompletableDeferred<MediaInfo>>()
    private val inFlightSearch = ConcurrentHashMap<String, CompletableDeferred<List<MediaInfo>>>()
    private val inFlightRemoteSearch = ConcurrentHashMap<String, CompletableDeferred<List<BackendVideo>>>()
    private val extractionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val feedCache = ConcurrentHashMap<String, CachedResponse>()
    private val knownJobs = ConcurrentHashMap.newKeySet<String>()
    private val canceledJobs = ConcurrentHashMap.newKeySet<String>()
    private val remoteJobs = ConcurrentHashMap<String, Pair<String, String>>()
    private val fallbackJobs = ConcurrentHashMap<String, String>()
    private val preparingJobs = ConcurrentHashMap<String, PreparingJob>()
    private val preparationStates = ConcurrentHashMap<String, VideoPreparation>()
    private val backendInstanceId = UUID.randomUUID().toString().take(12)

    init {
        Log.i(TAG, "PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} phase=backend_created instance=$backendInstanceId")
    }

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
            logTiming("PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} backend=$backendInstanceId request=$requestId path=$path phase=received thread=${Thread.currentThread().name}", requestStarted)

            val cacheKey = when (path) {
                "youtube-search" -> "search:${body.string("query").trim().lowercase()}"
                "youtube-topic" -> "topic:${body.string("topic").ifBlank { "All" }.lowercase()}"
                else -> null
            }
            if (cacheKey != null) {
                val cached = feedCache[cacheKey]
                if (cached != null && System.currentTimeMillis() - cached.createdAt < FEED_CACHE_TTL_MS) {
                    Log.d(TAG, "backend=$backendInstanceId request=$requestId path=$path SEARCH_CACHE_HIT key=$cacheKey durationMs=${elapsed(requestStarted)}")
                    return bridgeResponse(requestId, 200, cached.body)
                }
                Log.d(TAG, "backend=$backendInstanceId request=$requestId path=$path SEARCH_CACHE_MISS key=$cacheKey")
            }

            val (status, envelope) = when {
                path == "fetch-info" -> fetchInfo(body)
                path == "prepare-video" -> prepareVideo(body)
                path == "preparation-status" -> preparationStatus(body)
                path == "youtube-search" -> search(body)
                path == "youtube-topic" -> topic(body)
                path == "start-download" -> startDownload(body)
                path == "cancel-download" -> cancelDownload(body)
                path.startsWith("progress/") -> progress(path.substringAfter("progress/"))
                else -> 404 to errorEnvelope("Unknown local backend endpoint.")
            }
            val envelopeBody = envelope.toString()
            if (cacheKey != null && status == 200) {
                feedCache[cacheKey] = CachedResponse(System.currentTimeMillis(), envelopeBody)
                Log.d(TAG, "backend=$backendInstanceId request=$requestId path=$path SEARCH_CACHE_STORE key=$cacheKey")
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
        if (ErrorClassifier.classify(error) == ErrorClassifier.ErrorType.NETWORK_ERROR) {
            return "The website took too long to respond. Check your connection and try again."
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
        preparationStates.entries.removeIf { (_, state) ->
            state.pendingQuality == null && state.completedAt > 0L && now - state.completedAt >= INFO_CACHE_TTL_MS
        }
    }

    private suspend fun fetchInfo(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val requestId = UUID.randomUUID().toString().take(8)

        // The preset response below is YouTube-specific. Other pasted links
        // need real metadata so their preview and quality list match the item
        // that the unchanged local yt-dlp download flow will download.
        if (!SourcePlatform.isYouTube(url)) {
            Log.i(TAG, "backend=$backendInstanceId operation=$requestId info_source=local_ytdlp source=${SourcePlatform.label(url)}")
            val media = try {
                loadInfo(url, requestId)
            } catch (error: Exception) {
                // A preview is helpful but not required to download. Shared
                // links can still be handed directly to yt-dlp when their
                // source blocks a metadata-only request.
                Log.w(
                    TAG,
                    "backend=$backendInstanceId operation=$requestId info_source=fallback source=${SourcePlatform.label(url)} reason=${error.message}",
                )
                fallbackMediaInfo(url)
            }
            return 200 to buildJsonObject {
                put("ok", true)
                // The production frontend currently expects at least one
                // quality for every fetched link. Non-YouTube sources expose
                // a single safe "best available" option.
                put("video", mediaJson(media, url, includeQualities = true))
            }
        }

        val remote = if (BuildConfig.USE_BACKEND_FORMAT_EXTRACTION) runCatching { remoteBackend.info(url) }
            .onSuccess { Log.d(TAG, "backend=$backendInstanceId operation=$requestId info_source=railway qualities=${it.qualities.size}") }
            .onFailure { Log.d(TAG, "backend=$backendInstanceId operation=$requestId info_source=railway failed=${it.message}") }
            .getOrNull() else null
        if (remote != null && remote.qualities.isNotEmpty()) {
            Log.i(TAG, "backend=$backendInstanceId formats_source=backend key=${YouTubeUrls.videoId(url).orEmpty()}")
            return 200 to buildJsonObject {
                put("ok", true)
                put("video", backendVideoInfoJson(remote, url))
            }
        }
        if (BuildConfig.USE_PRESET_FORMAT_FALLBACK) {
            Log.i(TAG, "backend=$backendInstanceId formats_source=preset_fallback url=$url")
            return 200 to buildJsonObject {
                put("ok", true)
                put("video", presetVideoInfoJson(url))
            }
        }
        if (BuildConfig.USE_LOCAL_FORMAT_EXTRACTION_FALLBACK) {
            Log.w(TAG, "backend=$backendInstanceId formats_source=local_extraction url=$url")
            val media = loadInfo(url, requestId)
            return 200 to buildJsonObject {
                put("ok", true)
                put("video", mediaJson(media, url, includeQualities = false))
            }
        }
        Log.w(TAG, "backend=$backendInstanceId formats_source=backend unavailable url=$url")
        throw BackendRequestException("The backend could not provide download qualities for this video.")
    }

    private suspend fun search(body: JsonObject): Pair<Int, JsonObject> {
        val query = body.string("query").trim()
        require(query.isNotBlank()) { "Enter a search term." }
        val started = SystemClock.elapsedRealtime()
        val operationId = "search-${UUID.randomUUID().toString().take(8)}"
        Log.d(TAG, "operation=$operationId phase=search_start query=${query.take(120)}")
        val remoteVideos = runCatching { loadRemoteSearch(query, operationId) }
            .onSuccess { Log.d(TAG, "backend=$backendInstanceId operation=$operationId search_source=railway results=${it.size}") }
            .onFailure { Log.d(TAG, "backend=$backendInstanceId operation=$operationId search_source=railway failed=${it.message}") }
            .getOrNull()
        val response = if (!remoteVideos.isNullOrEmpty()) {
            buildJsonObject {
                put("ok", true)
                put("videos", backendVideoArray(remoteVideos))
            }
        } else {
            val videos = loadSearch(query, 8, operationId)
            buildJsonObject {
                put("ok", true)
                put("videos", mediaArray(videos))
            }
        }
        Log.d(TAG, "operation=$operationId phase=search_finish durationMs=${elapsed(started)}")
        return 200 to response
    }

    private suspend fun loadSearch(query: String, limit: Int, operationId: String): List<MediaInfo> {
        val key = "search:${query.trim().replace(Regex("\\s+"), " ").lowercase()}:limit:$limit"
        val deferred = synchronized(inFlightSearch) {
            inFlightSearch[key] ?: CompletableDeferred<List<MediaInfo>>().also { created ->
                inFlightSearch[key] = created
                extractionScope.launch {
                    try {
                        val videos = withContext(Dispatchers.IO) { extractor.searchYouTube(query, limit) }
                        created.complete(videos)
                    } catch (error: Throwable) {
                        created.completeExceptionally(error)
                    } finally {
                        inFlightSearch.remove(key, created)
                    }
                }
            }
        }
        if (deferred !== inFlightSearch[key]) {
            Log.d(TAG, "backend=$backendInstanceId operation=$operationId SEARCH_SINGLE_FLIGHT_JOIN key=$key")
        }
        return deferred.await()
    }

    private suspend fun loadRemoteSearch(query: String, operationId: String): List<BackendVideo> {
        val key = "search:${query.trim().replace(Regex("\\s+"), " ").lowercase()}:limit:12"
        val deferred = synchronized(inFlightRemoteSearch) {
            inFlightRemoteSearch[key] ?: CompletableDeferred<List<BackendVideo>>().also { created ->
                inFlightRemoteSearch[key] = created
                extractionScope.launch {
                    try {
                        created.complete(remoteBackend.search(query))
                    } catch (error: Throwable) {
                        created.completeExceptionally(error)
                    } finally {
                        inFlightRemoteSearch.remove(key, created)
                    }
                }
            }
        }
        if (deferred !== inFlightRemoteSearch[key]) {
            Log.d(TAG, "backend=$backendInstanceId operation=$operationId SEARCH_REMOTE_SINGLE_FLIGHT_JOIN key=$key")
        }
        return deferred.await()
    }

    private suspend fun topic(body: JsonObject): Pair<Int, JsonObject> {
        val topic = body.string("topic").ifBlank { "All" }
        val query = topicQuery(topic)
        val started = SystemClock.elapsedRealtime()
        val operationId = "search-${UUID.randomUUID().toString().take(8)}"
        Log.d(TAG, "operation=$operationId phase=search_start topic=$topic")
        val remoteVideos = runCatching { loadRemoteSearch(query, operationId) }
            .onSuccess { Log.d(TAG, "backend=$backendInstanceId operation=$operationId search_source=railway results=${it.size}") }
            .onFailure { Log.d(TAG, "backend=$backendInstanceId operation=$operationId search_source=railway failed=${it.message}") }
            .getOrNull()
        val videos = remoteVideos?.takeIf { it.isNotEmpty() }?.let { backendVideoArray(it) }
            ?: mediaArray(loadSearch(query, 8, operationId))
        Log.d(TAG, "operation=$operationId phase=search_finish durationMs=${elapsed(started)}")
        return 200 to buildJsonObject {
            put("ok", true)
            put("topic", topic)
            put("query", query)
            put("videos", videos)
        }
    }

    private fun prepareVideo(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val operationId = body.string("operationId").ifBlank { "prepare-${UUID.randomUUID().toString().take(8)}" }
        val key = stableInfoKey(url)
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=VIDEO_CLICKED key=$key")
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_REQUESTED key=$key")
        requestPreparation(url, operationId)
        val status = preparationStates[key]?.status ?: PreparationStatus.IDLE
        return 200 to buildJsonObject {
            put("ok", true)
            put("videoKey", key)
            put("status", status.name.lowercase())
        }
    }

    private fun preparationStatus(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val key = stableInfoKey(url)
        val operationId = body.string("operationId").ifBlank { "download-${UUID.randomUUID().toString().take(8)}" }
        val state = preparationStates[key]
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=DOWNLOAD_BUTTON_CLICKED key=$key state=${state?.status ?: PreparationStatus.IDLE}")
        return 200 to buildJsonObject {
            put("ok", true)
            put("videoKey", key)
            put("status", (state?.status ?: PreparationStatus.IDLE).name.lowercase())
            state?.pendingQuality?.let { put("pendingQuality", it) }
            state?.error?.let { put("error", it) }
        }
    }

    private fun requestPreparation(url: String, operationId: String) {
        val key = stableInfoKey(url)
        val cached = infoCache[key]?.takeIf {
            System.currentTimeMillis() - it.createdAt < INFO_CACHE_TTL_MS
        }
        if (cached != null) {
            synchronized(preparationStates) {
                val current = preparationStates[key] ?: VideoPreparation(key, url)
                preparationStates[key] = current.copy(
                    status = PreparationStatus.READY,
                    media = cached.media,
                    error = null,
                    completedAt = System.currentTimeMillis(),
                )
            }
            Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_CACHE_HIT key=$key")
            startPendingDownloadIfReady(key, operationId)
            return
        }

        val shouldStart = synchronized(preparationStates) {
            val current = preparationStates[key]
            when (current?.status) {
                PreparationStatus.PREPARING -> false
                PreparationStatus.READY -> current.media == null
                else -> {
                    preparationStates[key] = (current ?: VideoPreparation(key, url)).copy(
                        status = PreparationStatus.PREPARING,
                        media = null,
                        error = null,
                        startedAt = System.currentTimeMillis(),
                        completedAt = 0L,
                        downloadStarted = false,
                    )
                    true
                }
            }
        }
        if (!shouldStart) {
            Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_JOINED_IN_FLIGHT key=$key")
            return
        }

        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_CACHE_MISS key=$key")
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_STARTED key=$key")
        extractionScope.launch {
            val started = SystemClock.elapsedRealtime()
            try {
                Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=YTDLP_INFO_STARTED key=$key")
                val media = loadInfo(url, operationId)
                synchronized(preparationStates) {
                    val current = preparationStates[key] ?: VideoPreparation(key, url)
                    preparationStates[key] = current.copy(
                        status = PreparationStatus.READY,
                        media = media,
                        error = null,
                        completedAt = System.currentTimeMillis(),
                    )
                }
                Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=YTDLP_INFO_FINISHED key=$key durationMs=${elapsed(started)}")
                Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_READY key=$key durationMs=${elapsed(started)}")
                startPendingDownloadIfReady(key, operationId)
            } catch (error: Throwable) {
                val shouldStartWithoutMetadata = synchronized(preparationStates) {
                    val current = preparationStates[key] ?: VideoPreparation(key, url)
                    if (current.pendingJobId != null && current.pendingQuality != null) {
                        preparationStates[key] = current.copy(
                            status = PreparationStatus.READY,
                            media = fallbackMediaInfo(url),
                            error = null,
                            completedAt = System.currentTimeMillis(),
                        )
                        true
                    } else {
                        preparationStates[key] = current.copy(
                            status = PreparationStatus.FAILED,
                            error = error.message ?: "Video preparation failed.",
                            completedAt = System.currentTimeMillis(),
                        )
                        false
                    }
                }
                if (shouldStartWithoutMetadata) {
                    Log.w(
                        TAG,
                        "backend=$backendInstanceId operation=$operationId event=PREPARATION_BYPASSED key=$key reason=${error.message}",
                    )
                    startPendingDownloadIfReady(key, operationId)
                } else {
                    Log.e(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_FAILED key=$key durationMs=${elapsed(started)}", error)
                }
            }
        }
    }

    private suspend fun startDownload(body: JsonObject): Pair<Int, JsonObject> {
        val url = validatedUrl(body.string("url"))
        val requestedQuality = validatedQuality(body.string("quality"))
        // Non-YouTube sources do not expose a reliable user-selectable
        // quality list. Always let yt-dlp choose the best available stream.
        val quality = if (SourcePlatform.isYouTube(url)) requestedQuality else "best"
        val operationId = body.string("operationId").ifBlank { "select-${UUID.randomUUID().toString().take(8)}" }
        val key = stableInfoKey(url)
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=DOWNLOAD_BUTTON_CLICKED key=$key")
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=CUSTOM_QUALITY_SELECTED key=$key quality=$quality")
        dao.findActiveByUrl(url)?.let { active ->
            knownJobs += active.id
            return 200 to buildJsonObject {
                put("ok", true)
                put("job_id", active.id)
            }
        }

        if (!BuildConfig.USE_LOCAL_DOWNLOAD_FALLBACK) {
            throw BackendRequestException("Local download fallback is disabled.")
        }
        resetFinishedPreparationDownload(key, operationId)
        val localJobId = queuePreparedDownload(url, quality, operationId)
        return 200 to buildJsonObject {
            put("ok", true)
            put("job_id", localJobId)
        }
    }

    private suspend fun resetFinishedPreparationDownload(key: String, operationId: String) {
        val previousJobId = synchronized(preparationStates) {
            preparationStates[key]
                ?.takeIf { it.downloadStarted }
                ?.pendingJobId
        } ?: return
        val previousJob = dao.getById(previousJobId) ?: return
        if (!DownloadRetryPolicy.isFinished(previousJob.status)) return

        val reset = synchronized(preparationStates) {
            val current = preparationStates[key]
            if (current?.pendingJobId != previousJobId || !current.downloadStarted) {
                false
            } else {
                preparationStates[key] = current.copy(
                    pendingQuality = null,
                    pendingJobId = null,
                    error = null,
                    downloadStarted = false,
                )
                true
            }
        }
        if (reset) {
            preparingJobs.remove(previousJobId)
            Log.i(
                TAG,
                "backend=$backendInstanceId operation=$operationId event=DOWNLOAD_RETRY_STATE_RESET " +
                    "key=$key previousJob=$previousJobId previousStatus=${previousJob.status}",
            )
        }
    }

    private suspend fun progress(jobId: String): Pair<Int, JsonObject> {
        if (jobId in canceledJobs) {
            return 200 to buildJsonObject {
                put("ok", true)
                put("job", buildJsonObject {
                    put("status", "canceled")
                    put("percent", 0)
                })
            }
        }
        fallbackJobs[jobId]?.let { return progress(it) }
        preparingJobs[jobId]?.let { preparing ->
            return 200 to buildJsonObject {
                put("ok", true)
                put("job", buildJsonObject {
                    put("status", if (preparing.error == null) "processing" else "error")
                    put("percent", 0)
                    preparing.error?.let { put("error", it) }
                    if (preparing.error == null) put("message", "Preparing download on this device…")
                })
            }
        }
        remoteJobs[jobId]?.let { (url, quality) ->
            val remoteJob = remoteBackend.progress(jobId.removePrefix("remote:"))
            if (remoteJob.status == "error") {
                remoteJobs.remove(jobId)
                if (!BuildConfig.USE_LOCAL_DOWNLOAD_FALLBACK) {
                    return 200 to buildJsonObject {
                        put("ok", true)
                        put("job", buildJsonObject {
                            put("status", "error")
                            put("percent", remoteJob.percent)
                            put("error", remoteJob.error ?: "The backend download failed.")
                        })
                    }
                }
                val localJob = synchronized(fallbackJobs) {
                    fallbackJobs[jobId] ?: queuePreparedDownload(
                        validatedUrl(url),
                        validatedQuality(quality),
                        "remote-${UUID.randomUUID().toString().take(8)}",
                    ).also {
                        fallbackJobs[jobId] = it
                    }
                }
                Log.w(TAG, "backend=$backendInstanceId download_source=local_ytdlp remote_job=$jobId reason=${remoteJob.error}")
                return 200 to buildJsonObject {
                    put("ok", true)
                    put("job", buildJsonObject {
                        put("status", "queued")
                        put("percent", 0)
                        put("fallback_job_id", localJob)
                    })
                }
            }
            return remoteJobJson(remoteJob)
        }
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

    private suspend fun cancelDownload(body: JsonObject): Pair<Int, JsonObject> {
        val jobId = body.string("job_id").trim()
        require(jobId.isNotBlank()) { "Download job was not found." }

        canceledJobs += jobId
        preparingJobs.remove(jobId)
        fallbackJobs.remove(jobId)?.let { canceledJobs += it }
        remoteJobs.remove(jobId)
        synchronized(preparationStates) {
            preparationStates.replaceAll { _, current ->
                if (current.pendingJobId == jobId) {
                    current.copy(
                        pendingQuality = null,
                        pendingJobId = null,
                        downloadStarted = false,
                    )
                } else {
                    current
                }
            }
        }

        dao.getById(jobId)?.let {
            app.startService(DownloadService.createCancelIntent(app, jobId))
        }
        return 200 to buildJsonObject { put("ok", true) }
    }

    private fun queuePreparedDownload(url: String, quality: String, operationId: String): String {
        val key = stableInfoKey(url)
        val jobId: String
        var alreadyStarted = false
        synchronized(preparationStates) {
            val current = preparationStates[key] ?: VideoPreparation(key, url)
            jobId = current.pendingJobId ?: UUID.randomUUID().toString()
            alreadyStarted = current.downloadStarted
            if (!alreadyStarted) {
                preparationStates[key] = current.copy(
                    pendingQuality = quality,
                    pendingJobId = jobId,
                )
            }
        }
        knownJobs += jobId
        if (alreadyStarted) return jobId
        preparingJobs[jobId] = PreparingJob(url, quality)
        Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=QUALITY_STORED_PENDING key=$key quality=$quality job=$jobId")
        requestPreparation(url, operationId)
        startPendingDownloadIfReady(key, operationId)
        return jobId
    }

    private fun startPendingDownloadIfReady(key: String, operationId: String) {
        val prepared = synchronized(preparationStates) {
            val current = preparationStates[key] ?: return
            val media = current.media ?: return
            val quality = current.pendingQuality ?: return
            val jobId = current.pendingJobId ?: return
            if (current.status != PreparationStatus.READY || current.downloadStarted) return
            preparationStates[key] = current.copy(downloadStarted = true)
            Triple(jobId, quality, media)
        }
        extractionScope.launch {
            val (jobId, quality, media) = prepared
            if (jobId in canceledJobs) {
                preparingJobs.remove(jobId)
                return@launch
            }
            try {
                Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=QUALITY_RESOLVED key=$key quality=$quality")
                startPreparedDownload(jobId, preparationStates[key]?.url ?: media.webpageUrl, quality, media)
                synchronized(preparationStates) {
                    preparationStates[key]?.let { current ->
                        preparationStates[key] = current.copy(pendingQuality = null)
                    }
                }
                Log.i(TAG, "backend=$backendInstanceId operation=$operationId event=AUTO_DOWNLOAD_TRIGGERED key=$key quality=$quality job=$jobId")
            } catch (error: Throwable) {
                synchronized(preparationStates) {
                    preparationStates[key]?.let { current ->
                        preparationStates[key] = current.copy(downloadStarted = false, error = error.message)
                    }
                }
                preparingJobs[jobId] = PreparingJob(preparationStates[key]?.url.orEmpty(), quality, error.message ?: "Download could not start.")
                Log.e(TAG, "backend=$backendInstanceId operation=$operationId event=PREPARATION_FAILED key=$key job=$jobId", error)
            }
        }
    }

    private suspend fun startPreparedDownload(jobId: String, url: String, quality: String, media: MediaInfo) {
        if (jobId in canceledJobs) return
        val audioOnly = quality.equals("audio", ignoreCase = true)
        val height = quality.toIntOrNull()
        val selectedFormat = media.formats
            .filter { !audioOnly && it.hasVideo && (height == null || it.height <= height) }
            .maxByOrNull { it.height }
        val request = DownloadRequest(
            id = jobId,
            url = url,
            mediaInfo = media,
            formatSelector = FormatSelector.build(audioOnly, height, videoContainer = "mp4"),
            isAudioOnly = audioOnly,
            mergeFormat = outputFormatFor(audioOnly),
            qualityLabel = if (audioOnly) "Audio only" else height?.let { "Up to ${it}p" } ?: "Best available",
            // Put WebView/automatic video downloads in MediaStore.Video so
            // gallery apps index them. Downloads collection entries are not
            // consistently surfaced by gallery apps (notably TikTok).
            destination = "media",
            expectedBytes = selectedFormat?.effectiveFilesize ?: 0L,
        )
        knownJobs += jobId
        preparingJobs.remove(jobId)
        ContextCompat.startForegroundService(app, DownloadService.createStartIntent(app, request))
        Log.i(TAG, "backend=$backendInstanceId event=DOWNLOAD_JOB_STARTED key=${stableInfoKey(url)} quality=$quality job=$jobId")
    }

    private fun remoteJobJson(job: com.reelhouse.downloader.youtube.BackendJob): Pair<Int, JsonObject> =
        200 to buildJsonObject {
            put("ok", true)
            put("job", buildJsonObject {
                put("status", job.status)
                put("percent", job.percent)
                job.error?.let { put("error", it) }
                job.result?.let { result ->
                    put("result", buildJsonObject {
                        put("title", result.title)
                        put("filename", result.filename)
                        put("file_url", result.fileUrl)
                        put("filesize_mb", result.sizeMb)
                        put("source_url", "")
                    })
                }
            })
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

    private fun backendVideoArray(videos: List<BackendVideo>): JsonArray = buildJsonArray {
        videos.forEach { video ->
            add(buildJsonObject {
                put("id", video.id)
                put("title", video.title)
                put("channel", video.channel)
                put("duration", video.duration)
                put("thumbnail", video.thumbnail)
                put("source_url", video.sourceUrl)
                put("webpage_url", video.sourceUrl)
                put("platform", video.platform)
            })
        }
    }

    private fun backendVideoInfoJson(video: BackendVideo, sourceUrl: String): JsonObject = buildJsonObject {
        put("id", video.id)
        put("title", video.title)
        put("channel", video.channel)
        put("duration", video.duration)
        put("thumbnail", video.thumbnail)
        put("source_url", sourceUrl)
        put("webpage_url", sourceUrl)
        put("platform", video.platform)
        put("embed_url", YouTubeUrls.embedUrl(video.id).orEmpty())
        put("can_embed", video.id.isNotBlank())
        put("qualities", buildJsonArray {
            video.qualities.forEach { quality ->
                add(buildJsonObject {
                    put("value", quality.value)
                    put("label", quality.label)
                    put("extension", quality.extension)
                    put("filesize_label", quality.sizeLabel)
                })
            }
        })
    }

    private fun presetVideoInfoJson(sourceUrl: String): JsonObject = buildJsonObject {
        val videoId = YouTubeUrls.videoId(sourceUrl).orEmpty()
        put("id", videoId)
        put("title", "YouTube video")
        put("channel", "YouTube")
        put("duration", "Unknown duration")
        put("thumbnail", videoId.takeIf { it.isNotBlank() }?.let { "https://i.ytimg.com/vi/$it/hqdefault.jpg" }.orEmpty())
        put("source_url", sourceUrl)
        put("webpage_url", sourceUrl)
        put("platform", "YouTube")
        put("can_embed", videoId.isNotBlank())
        put("embed_url", videoId.takeIf { it.isNotBlank() }?.let { "https://www.youtube.com/embed/$it" }.orEmpty())
        put("qualities", buildJsonArray {
            listOf("144", "240", "360", "480", "720", "1080").forEach { height ->
                add(buildJsonObject {
                    put("value", height)
                    put("label", "Up to ${height}p")
                    put("extension", "mp4")
                    put("filesize_label", "Estimated size")
                })
            }
            add(buildJsonObject {
                put("value", "best")
                put("label", "Best available")
                put("extension", "mp4")
                put("filesize_label", "Estimated size")
            })
            add(buildJsonObject {
                put("value", "audio")
                put("label", "Audio only")
                put("extension", "mp3")
                put("filesize_label", "Estimated size")
            })
        })
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
        put("platform", SourcePlatform.label(sourceUrl, media.platform))
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
        val videoQualities = formats.asSequence()
            .filter { it.hasVideo && it.height > 0 }
            .groupBy { it.height }
            .map { (height, choices) ->
                height to choices.maxByOrNull { it.effectiveFilesize }
            }
            .sortedByDescending { it.first }
            .take(8)
            .toList()

        videoQualities.forEach { (height, format) ->
                add(buildJsonObject {
                    put("value", height.toString())
                    put("label", "${height}p")
                    put("extension", format?.ext?.ifBlank { "mp4" } ?: "mp4")
                    put("filesize_label", format?.filesizeFormatted ?: "Unknown size")
                })
            }

        if (videoQualities.isEmpty()) {
            val bestVideo = formats.firstOrNull { it.hasVideo }
            add(buildJsonObject {
                put("value", "best")
                put("label", "Best available")
                put("extension", bestVideo?.ext?.ifBlank { "mp4" } ?: "mp4")
                put("filesize_label", bestVideo?.filesizeFormatted ?: "Unknown size")
            })
        }
    }

    private fun downloadJobJson(item: DownloadEntity): JsonObject = buildJsonObject {
        val publicStatus = when (item.status) {
            DownloadEntity.Status.COMPLETE -> "complete"
            DownloadEntity.Status.CANCELLED -> "canceled"
            DownloadEntity.Status.FAILED -> "error"
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
                put("file_url", "android-media/${item.id}")
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

    private fun validatedQuality(rawQuality: String): String {
        val quality = rawQuality.trim().lowercase().removeSuffix("p").ifBlank { "best" }
        require(quality in CUSTOM_QUALITIES) { "Unsupported download quality." }
        return quality
    }

    private suspend fun loadInfo(url: String, operationId: String): MediaInfo {
        val started = SystemClock.elapsedRealtime()
        val key = stableInfoKey(url)
        val cached = infoCache[key]
        if (cached != null && System.currentTimeMillis() - cached.createdAt < INFO_CACHE_TTL_MS) {
            Log.d(TAG, "backend=$backendInstanceId operation=$operationId key=$key INFO_CACHE_HIT lookupMs=${elapsed(started)}")
            return cached.media
        }
        Log.d(TAG, "backend=$backendInstanceId operation=$operationId key=$key INFO_CACHE_MISS lookupMs=${elapsed(started)}")

        val deferred = synchronized(inFlightInfo) {
            inFlightInfo[key] ?: CompletableDeferred<MediaInfo>().also { created ->
                inFlightInfo[key] = created
                extractionScope.launch {
                    val extractionStarted = SystemClock.elapsedRealtime()
                    Log.d(TAG, "operation=$operationId key=$key extraction=start")
                    try {
                        val media = withContext(Dispatchers.IO) {
                            // The fast manifest path is YouTube-specific. Running it
                            // for Instagram, TikTok, Facebook, and generic links made
                            // a failed request run twice before surfacing its error.
                            if (!SourcePlatform.isYouTube(url)) {
                                extractor.extractInfo(url)
                            } else {
                                try {
                                    extractor.extractInfoFast(url)
                                        .takeIf { it.formats.any { format -> format.hasVideo && format.height > 0 } }
                                } catch (error: Exception) {
                                    // A second request cannot repair a network timeout;
                                    // return it immediately instead of making the user wait
                                    // through another socket timeout.
                                    if (ErrorClassifier.classify(error) == ErrorClassifier.ErrorType.NETWORK_ERROR) {
                                        throw error
                                    }
                                    null
                                } ?: extractor.extractInfo(url)
                            }
                        }
                        infoCache[key] = CachedInfo(System.currentTimeMillis(), media)
                        Log.d(TAG, "backend=$backendInstanceId operation=$operationId INFO_CACHE_STORE key=$key expiresInMs=$INFO_CACHE_TTL_MS")
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
        if (!videoId.isNullOrBlank()) return "youtube:$videoId"

        // URL paths and query values may be case-sensitive. Normalize only the
        // components whose casing is case-insensitive, preserving the rest.
        val parsed = Uri.parse(url.trim())
        val scheme = parsed.scheme?.lowercase().orEmpty()
        val host = parsed.host?.lowercase().orEmpty()
        val authority = buildString {
            if (parsed.userInfo != null) append(parsed.userInfo).append('@')
            append(host)
            if (parsed.port >= 0) append(':').append(parsed.port)
        }
        val path = parsed.encodedPath.orEmpty()
        val query = parsed.encodedQuery?.let { "?$it" }.orEmpty()
        return "url:$scheme://$authority$path$query"
    }

    private fun fallbackMediaInfo(url: String): MediaInfo {
        val platform = SourcePlatform.label(url)
        val sourceId = YouTubeUrls.videoId(url)
            ?: Uri.parse(url).lastPathSegment?.take(80)
            ?: "shared-video"
        return MediaInfo(
            id = sourceId,
            title = "$platform video",
            uploader = platform,
            platform = platform,
            webpageUrl = url,
        )
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
        private val CUSTOM_QUALITIES = setOf("audio", "144", "240", "360", "480", "720", "1080", "best")
    }
}
