package com.reelhouse.downloader.media

import android.content.Context
import com.reelhouse.downloader.ReelhouseApp
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Installs explicit, checksum-verified yt-dlp stable updates from official GitHub releases. */
class YtDlpUpdater(private val context: Context) {
    sealed class UpdateResult {
        data class Updated(val version: String) : UpdateResult()
        data object AlreadyLatest : UpdateResult()
        data class Failed(val message: String) : UpdateResult()
    }

    private val preferences = context.getSharedPreferences("engine_update", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    /** Explicit user-requested update. Always checks the official release. */
    suspend fun update(): UpdateResult = updateInternal(waitForApplicationEngine = true)

    /**
     * Performs a throttled update check after YoutubeDL has been initialized,
     * but before the application exposes the engine to extraction/download
     * callers. Fresh installs therefore do not remain pinned to the yt-dlp
     * version bundled in the Android wrapper.
     */
    suspend fun updateAfterEngineInitializationIfDue(
        nowMs: Long = System.currentTimeMillis(),
    ): UpdateResult? = withContext(Dispatchers.IO) {
        UPDATE_MUTEX.withLock {
            val lastAttempt = preferences.getLong(KEY_LAST_UPDATE_ATTEMPT, 0L)
            val lastSuccess = preferences.getLong(KEY_LAST_UPDATE_SUCCESS, 0L)
            if (!isEngineUpdateDue(nowMs, lastAttempt, lastSuccess)) {
                return@withLock null
            }

            preferences.edit().putLong(KEY_LAST_UPDATE_ATTEMPT, nowMs).apply()
            performUpdate().also { result ->
                if (result is UpdateResult.Updated || result == UpdateResult.AlreadyLatest) {
                    preferences.edit().putLong(KEY_LAST_UPDATE_SUCCESS, nowMs).apply()
                }
            }
        }
    }

    private suspend fun updateInternal(waitForApplicationEngine: Boolean): UpdateResult =
        withContext(Dispatchers.IO) {
            if (waitForApplicationEngine) {
                (context.applicationContext as? ReelhouseApp)?.awaitEngineReady()
            }
            UPDATE_MUTEX.withLock {
                val nowMs = System.currentTimeMillis()
                preferences.edit().putLong(KEY_LAST_UPDATE_ATTEMPT, nowMs).apply()
                performUpdate().also { result ->
                    if (result is UpdateResult.Updated || result == UpdateResult.AlreadyLatest) {
                        preferences.edit().putLong(KEY_LAST_UPDATE_SUCCESS, nowMs).apply()
                    }
                }
            }
        }

    private fun performUpdate(): UpdateResult {
        return try {
            val releaseBytes = fetch(OFFICIAL_RELEASE_API, 2 * 1024 * 1024)
            val release = json.parseToJsonElement(releaseBytes.decodeToString()).jsonObject
            val version = release.getValue("tag_name").jsonPrimitive.content
            if (version.removePrefix("v") == readInstalledVersion().removePrefix("v")) {
                return UpdateResult.AlreadyLatest
            }

            val assets = release.getValue("assets").jsonArray.map { it.jsonObject }
            val executableUrl = assets.firstOrNull {
                it["name"]?.jsonPrimitive?.content == "yt-dlp"
            }?.get("browser_download_url")?.jsonPrimitive?.content
                ?: error("The official release does not contain the yt-dlp component.")
            val checksumsUrl = assets.firstOrNull {
                it["name"]?.jsonPrimitive?.content == "SHA2-256SUMS"
            }?.get("browser_download_url")?.jsonPrimitive?.content
                ?: error("The official release does not contain SHA-256 checksums.")

            val checksums = fetch(checksumsUrl, 2 * 1024 * 1024).decodeToString()
            val expected = checksums.lineSequence()
                .map { it.trim().split(Regex("\\s+"), limit = 2) }
                .firstOrNull { it.size == 2 && it[1].removePrefix("*") == "yt-dlp" }
                ?.firstOrNull()
                ?: error("The yt-dlp checksum is missing from the official release.")
            check(expected.matches(Regex("[0-9a-fA-F]{64}"))) {
                "The official release contains an invalid yt-dlp checksum."
            }
            val executable = fetch(executableUrl, 32 * 1024 * 1024)
            check(executable.size >= 512 * 1024 && executable.decodeToString(0, minOf(64, executable.size)).startsWith("#!/usr/bin/env python3")) {
                "The downloaded component is not a valid yt-dlp executable."
            }
            val actual = MessageDigest.getInstance("SHA-256")
                .digest(executable)
                .joinToString("") { "%02x".format(it) }
            check(actual.equals(expected, ignoreCase = true)) {
                "The downloaded component failed SHA-256 verification."
            }

            installAtomically(executable, version)
            preferences.edit().putString(KEY_VERSION, version).apply()
            UpdateResult.Updated(version)
        } catch (error: Exception) {
            UpdateResult.Failed(
                error.message ?: "Update failed. The bundled engine remains available."
            )
        }
    }

    suspend fun currentVersion(): String = withContext(Dispatchers.IO) {
        try {
            (context.applicationContext as? ReelhouseApp)?.awaitEngineReady()
            readInstalledVersion()
        } catch (_: Exception) {
            preferences.getString(KEY_VERSION, null)
                ?: YoutubeDL.getInstance().version(context)
                ?: "unavailable"
        }
    }

    suspend fun restoreBundled(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            val directory = File(
                File(context.noBackupFilesDir, YoutubeDL.baseName),
                YoutubeDL.ytdlpDirName,
            )
            val target = File(directory, YoutubeDL.ytdlpBin)
            if (target.exists() && !target.delete()) error("Could not remove the updated component.")
            YoutubeDL.getInstance().init_ytdlp(context, directory)
            preferences.edit().remove(KEY_VERSION).apply()
            UpdateResult.Updated("bundled")
        } catch (error: Exception) {
            UpdateResult.Failed(error.message ?: "Could not restore the bundled engine.")
        }
    }

    private fun installAtomically(bytes: ByteArray, expectedVersion: String) {
        val directory = File(
            File(context.noBackupFilesDir, YoutubeDL.baseName),
            YoutubeDL.ytdlpDirName,
        ).apply { mkdirs() }
        val target = File(directory, YoutubeDL.ytdlpBin)
        val staged = File(directory, "${YoutubeDL.ytdlpBin}.verified")
        val backup = File(directory, "${YoutubeDL.ytdlpBin}.previous")
        staged.outputStream().use { it.write(bytes) }

        if (backup.exists()) backup.delete()
        if (target.exists() && !target.renameTo(backup)) {
            staged.delete()
            error("Could not preserve the bundled download engine.")
        }
        if (!staged.renameTo(target)) {
            backup.renameTo(target)
            staged.delete()
            error("Could not install the verified download engine.")
        }
        try {
            val installedVersion = readInstalledVersion()
            check(installedVersion.removePrefix("v") == expectedVersion.removePrefix("v")) {
                "The updated engine did not report the expected version."
            }
            backup.delete()
        } catch (error: Exception) {
            target.delete()
            if (!backup.renameTo(target)) {
                YoutubeDL.getInstance().init_ytdlp(context, directory)
            }
            throw error
        }
    }

    private fun readInstalledVersion(): String {
        val request = YoutubeDLRequest(emptyList()).apply {
            addOption("--version")
            addOption("--no-config")
        }
        return YoutubeDL.getInstance().execute(request).out.trim()
            .lineSequence().firstOrNull { it.isNotBlank() }
            ?: error("The download engine did not report a version.")
    }

    private fun fetch(rawUrl: String, limit: Int): ByteArray {
        var url = URL(rawUrl)
        repeat(6) {
            require(url.protocol == "https" && isTrustedHost(url.host)) {
                "The update source is not trusted."
            }
            val connection = url.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("User-Agent", "Reelhouse-Android")
            val status = connection.responseCode
            if (status in 300..399) {
                val location = connection.getHeaderField("Location")
                    ?: error("The update server returned an invalid redirect.")
                connection.disconnect()
                url = URL(url, location)
                return@repeat
            }
            check(status in 200..299) { "The update server returned HTTP $status." }
            val declaredLength = connection.contentLengthLong
            check(declaredLength <= 0 || declaredLength <= limit) { "The update file is unexpectedly large." }
            val output = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    check(total <= limit) { "The update file is unexpectedly large." }
                    output.write(buffer, 0, count)
                }
            }
            connection.disconnect()
            return output.toByteArray()
        }
        error("The update server returned too many redirects.")
    }

    private fun isTrustedHost(host: String): Boolean = host.lowercase() in TRUSTED_HOSTS

    companion object {
        private const val OFFICIAL_RELEASE_API = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
        private const val KEY_VERSION = "verified_version"
        private const val KEY_LAST_UPDATE_ATTEMPT = "last_update_attempt"
        private const val KEY_LAST_UPDATE_SUCCESS = "last_update_success"
        private val UPDATE_MUTEX = Mutex()
        private val TRUSTED_HOSTS = setOf(
            "api.github.com",
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "github-releases.githubusercontent.com",
        )
    }
}

internal fun isEngineUpdateDue(
    nowMs: Long,
    lastAttemptMs: Long,
    lastSuccessMs: Long,
): Boolean {
    if (lastAttemptMs <= 0L) return true
    val elapsed = nowMs - lastAttemptMs
    if (elapsed < 0L) return true
    val interval = if (lastSuccessMs >= lastAttemptMs) {
        24 * 60 * 60 * 1000L
    } else {
        60 * 60 * 1000L
    }
    return elapsed >= interval
}
