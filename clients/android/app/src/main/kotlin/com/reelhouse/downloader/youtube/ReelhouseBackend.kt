package com.reelhouse.downloader.youtube

import com.reelhouse.downloader.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class BackendQuality(
    val value: String,
    val label: String,
    val extension: String,
    val sizeLabel: String,
)

data class BackendVideo(
    val id: String,
    val title: String,
    val channel: String,
    val duration: String,
    val thumbnail: String,
    val sourceUrl: String,
    val platform: String = "YouTube",
    val qualities: List<BackendQuality> = emptyList(),
)

data class BackendFile(
    val title: String,
    val filename: String,
    val fileUrl: String,
    val sizeMb: Double,
)

data class BackendJob(
    val status: String,
    val percent: Int,
    val error: String?,
    val result: BackendFile?,
)

class BackendRequestException(message: String) : Exception(message)

class ReelhouseBackend(
    private val baseUrl: String = BuildConfig.REELHOUSE_WEB_BASE_URL.trimEnd('/'),
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun topic(value: String): List<BackendVideo> =
        post("youtube-topic", buildJsonObject { put("topic", value) })
            .getValue("videos")
            .jsonArray
            .map { video(it.jsonObject) }

    suspend fun search(query: String): List<BackendVideo> =
        post("youtube-search", buildJsonObject { put("query", query) })
            .getValue("videos")
            .jsonArray
            .map { video(it.jsonObject) }

    suspend fun info(url: String): BackendVideo =
        video(
            post("fetch-info", buildJsonObject { put("url", url) })
                .getValue("video")
                .jsonObject,
        )

    suspend fun startDownload(url: String, quality: String): String =
        post(
            "start-download",
            buildJsonObject {
                put("url", url)
                put("quality", quality)
            },
        ).string("job_id").ifBlank {
            throw BackendRequestException("The backend did not create a download job.")
        }

    suspend fun progress(jobId: String): BackendJob {
        val job = get("progress/$jobId").getValue("job").jsonObject
        val result = job["result"]?.let { element ->
            if (element.toString() == "null") null else element.jsonObject.let { value ->
                BackendFile(
                    title = value.string("title"),
                    filename = value.string("filename").ifBlank { "Reelhouse-video.mp4" },
                    fileUrl = resolveFileUrl(value.string("file_url")),
                    sizeMb = value["filesize_mb"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: 0.0,
                )
            }
        }
        return BackendJob(
            status = job.string("status").ifBlank { "queued" },
            percent = job["percent"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()?.toInt() ?: 0,
            error = job["error"]?.jsonPrimitive?.contentOrNull,
            result = result,
        )
    }

    private suspend fun post(endpoint: String, payload: JsonObject): JsonObject =
        request(endpoint, "POST", payload.toString())

    private suspend fun get(endpoint: String): JsonObject =
        request(endpoint, "GET", null)

    private suspend fun request(
        endpoint: String,
        method: String,
        body: String?,
    ): JsonObject = withContext(Dispatchers.IO) {
        val connection = URL("$baseUrl/api/backend/${endpoint.trimStart('/')}")
            .openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 30_000
            connection.readTimeout = 120_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "ReelhouseAndroid/${BuildConfig.VERSION_NAME}")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }

            val responseCode = connection.responseCode
            val responseText = (if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            })?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            val envelope = runCatching { json.parseToJsonElement(responseText).jsonObject }
                .getOrElse {
                    throw BackendRequestException("The Reelhouse backend returned an invalid response ($responseCode).")
                }
            val ok = envelope["ok"]?.jsonPrimitive?.contentOrNull == "true"
            if (responseCode !in 200..299 || !ok) {
                throw BackendRequestException(
                    envelope.string("error").ifBlank { "Backend request failed ($responseCode)." },
                )
            }
            envelope
        } finally {
            connection.disconnect()
        }
    }

    private fun video(value: JsonObject): BackendVideo {
        val sourceUrl = value.string("source_url").ifBlank { value.string("webpage_url") }
        val qualities = value["qualities"]?.jsonArray?.map { item ->
            item.jsonObject.let { quality ->
                BackendQuality(
                    value = quality.string("value").ifBlank { "best" },
                    label = quality.string("label").ifBlank { "Best available" },
                    extension = quality.string("extension").ifBlank { "mp4" },
                    sizeLabel = quality.string("filesize_label").ifBlank { "Unknown size" },
                )
            }
        }.orEmpty()
        return BackendVideo(
            id = value.string("id").ifBlank { YouTubeUrls.videoId(sourceUrl).orEmpty() },
            title = value.string("title").ifBlank { "Untitled video" },
            channel = value.string("channel").ifBlank { "Unknown channel" },
            duration = value.string("duration").ifBlank { "Unknown duration" },
            thumbnail = value.string("thumbnail"),
            sourceUrl = sourceUrl,
            platform = value.string("platform").ifBlank { "YouTube" },
            qualities = qualities,
        )
    }

    private fun resolveFileUrl(value: String): String {
        if (value.startsWith("https://") || value.startsWith("http://")) return value
        val path = value.trimStart('/')
        return if (path.startsWith("api/backend/")) {
            "$baseUrl/$path"
        } else {
            "$baseUrl/api/backend/$path"
        }
    }

    private fun JsonObject.string(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull.orEmpty()
}
