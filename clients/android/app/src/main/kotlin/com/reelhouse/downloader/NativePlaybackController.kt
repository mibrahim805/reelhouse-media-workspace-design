package com.reelhouse.downloader

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

/**
 * The single owner of native playback for the application process.
 *
 * Keeping the player here means rotating or minimizing the native activity
 * only detaches a surface; it does not create a second decoder or restart the
 * stream. The activity is a view over this controller, not its owner.
 */
@OptIn(UnstableApi::class)
class NativePlaybackController(context: Context) {
    data class Session(
        val key: String,
        val uri: Uri,
        val online: Boolean,
        val sourceUrl: String,
        val title: String,
        val thumbnail: String,
    )

    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                DefaultDataSource.Factory(
                    context.applicationContext,
                    DefaultHttpDataSource.Factory()
                        .setUserAgent("ReelhouseAndroid/${BuildConfig.VERSION_NAME}")
                        .setAllowCrossProtocolRedirects(true),
                ),
            ),
        )
        .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
        .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
        .build()

    var session: Session? = null
        private set
    var errorMessage: String? = null

    fun hasSession(key: String): Boolean = session?.key == key && player.mediaItemCount > 0

    fun prepare(
        session: Session,
        positionMs: Long,
        speed: Float,
        autoplay: Boolean,
    ) {
        val sameMedia = hasSession(session.key) && player.currentMediaItem?.localConfiguration?.uri == session.uri
        this.session = session
        errorMessage = null
        if (!sameMedia) {
            player.setMediaItem(MediaItem.fromUri(session.uri))
            player.prepare()
            if (positionMs > 0L) player.seekTo(positionMs)
        } else if (positionMs > 0L && kotlin.math.abs(player.currentPosition - positionMs) > POSITION_TOLERANCE_MS) {
            player.seekTo(positionMs)
        }
        player.setPlaybackSpeed(speed.coerceIn(0.25f, 2f))
        player.playWhenReady = autoplay
        if (autoplay) player.play()
    }

    fun stop() {
        player.stop()
        session = null
        errorMessage = null
    }

    fun snapshot(): Snapshot {
        val active = session
        val duration = player.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: 0L
        return Snapshot(
            active = active != null,
            key = active?.key.orEmpty(),
            title = active?.title.orEmpty(),
            thumbnail = active?.thumbnail.orEmpty(),
            online = active?.online == true,
            playing = player.isPlaying,
            positionMs = player.currentPosition.coerceAtLeast(0L),
            durationMs = duration,
            speed = player.playbackParameters.speed,
            ended = player.playbackState == Player.STATE_ENDED,
            buffering = player.playbackState == Player.STATE_BUFFERING,
            error = errorMessage,
        )
    }

    data class Snapshot(
        val active: Boolean,
        val key: String,
        val title: String,
        val thumbnail: String,
        val online: Boolean,
        val playing: Boolean,
        val positionMs: Long,
        val durationMs: Long,
        val speed: Float,
        val ended: Boolean,
        val buffering: Boolean,
        val error: String?,
    )

    companion object {
        private const val SEEK_INCREMENT_MS = 10_000L
        private const val POSITION_TOLERANCE_MS = 1_000L
    }
}
