package com.reelhouse.downloader

import android.app.Application
import androidx.core.content.ContextCompat
import com.reelhouse.downloader.data.DownloadDatabase
import com.reelhouse.downloader.data.PreferencesRepository
import com.reelhouse.downloader.download.DownloadService
import com.reelhouse.downloader.download.toDownloadRequest
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import android.util.Log

class ReelhouseApp : Application() {
    val database by lazy { DownloadDatabase.getInstance(this) }
    val preferences by lazy { PreferencesRepository(this) }

    @Volatile
    var engineError: String? = null
        private set

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val engineReady = CompletableDeferred<Unit>()

    override fun onCreate() {
        super.onCreate()
        Log.i("ReelhousePerf", "PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} phase=application_start")
        applicationScope.launch {
            val activeDownloads = database.downloadDao().getActiveDownloadsOnce()
            activeDownloads.forEach { download ->
                Log.i(
                    "ReelhousePerf",
                    "event=BACKGROUND_DOWNLOAD_RECOVERY job=${download.id} status=${download.status}",
                )
                ContextCompat.startForegroundService(
                    this@ReelhouseApp,
                    DownloadService.createStartIntent(
                        this@ReelhouseApp,
                        download.toDownloadRequest(),
                    ),
                )
            }
        }
        applicationScope.launch {
            try {
                // Both wrappers unpack sizeable native/runtime payloads. Keep
                // that work off the main thread so first launch cannot ANR.
                YoutubeDL.getInstance().init(this@ReelhouseApp)
                FFmpeg.getInstance().init(this@ReelhouseApp)
                engineReady.complete(Unit)
            } catch (error: Exception) {
                val message = "The local download engine could not be initialized. " +
                    "Reinstall the app or restore the bundled engine from Settings."
                engineError = message
                engineReady.completeExceptionally(
                    IllegalStateException(message, error)
                )
            }
        }
    }

    suspend fun awaitEngineReady() {
        engineReady.await()
    }
}
