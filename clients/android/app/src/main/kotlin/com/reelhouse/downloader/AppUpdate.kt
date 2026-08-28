package com.reelhouse.downloader

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class AppUpdateInfo(
    val versionCode: Int,
    val versionName: String,
)

/** Checks the version of the APK served by the current Reelhouse deployment. */
class AppUpdateChecker(private val webBaseUrl: String) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun check(): AppUpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL("${webBaseUrl.trimEnd('/')}/api/app-update/android")
                .openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Reelhouse-Android/${BuildConfig.VERSION_NAME}")
            try {
                check(connection.responseCode in 200..299) {
                    "The app update server returned HTTP ${connection.responseCode}."
                }
                val body = connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        check(total <= 128 * 1024) { "The app update response is too large." }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray().decodeToString()
                }
                val payload = json.parseToJsonElement(body).jsonObject
                check(payload["ok"]?.jsonPrimitive?.content == "true") {
                    "The app update response was not successful."
                }
                val versionCode = payload["versionCode"]?.jsonPrimitive?.content?.toIntOrNull()
                    ?: error("The app update response did not include a version code.")
                val versionName = payload["versionName"]?.jsonPrimitive?.content
                    ?.takeIf { it.isNotBlank() }
                    ?: error("The app update response did not include a version name.")
                check(versionCode > 0) { "The app update response has an invalid version code." }
                AppUpdateInfo(versionCode, versionName)
                    .takeIf { isNewerAppVersion(it.versionCode, BuildConfig.VERSION_CODE) }
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }
}

internal fun isNewerAppVersion(availableVersionCode: Int, installedVersionCode: Int): Boolean =
    availableVersionCode > installedVersionCode
