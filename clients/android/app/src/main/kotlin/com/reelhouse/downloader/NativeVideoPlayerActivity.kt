package com.reelhouse.downloader

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.reelhouse.downloader.media.FormatInfo
import com.reelhouse.downloader.media.MediaExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** One custom, hardware-accelerated player for online streams and offline files. */
@OptIn(UnstableApi::class)
class NativeVideoPlayerActivity : ComponentActivity() {
    private val playback: NativePlaybackController
        get() = (application as ReelhouseApp).nativePlayback
    private val player: ExoPlayer
        get() = playback.player
    private var mediaKey = ""
    private var originalSource = ""
    private var videoTitle = "Video"
    private var online = false
    private var initialPositionMs = 0L

    private var controlsVisible by mutableStateOf(true)
    private var isPlaying by mutableStateOf(false)
    private var isLoading by mutableStateOf(true)
    private var playbackEnded by mutableStateOf(false)
    private var errorMessage by mutableStateOf<String?>(null)
    private var positionMs by mutableLongStateOf(0L)
    private var durationMs by mutableLongStateOf(0L)
    private var bufferedMs by mutableLongStateOf(0L)
    private var muted by mutableStateOf(false)
    private var playbackSpeed by mutableFloatStateOf(1f)
    private var gestureHint by mutableStateOf<String?>(null)
    private var locked by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val offlineUri = intent.getStringExtra(EXTRA_URI)?.let(Uri::parse)
        originalSource = intent.getStringExtra(EXTRA_SOURCE_URL).orEmpty()
        online = originalSource.isNotBlank()
        videoTitle = intent.getStringExtra(EXTRA_TITLE)?.takeIf(String::isNotBlank) ?: "Video"
        mediaKey = intent.getStringExtra(EXTRA_MEDIA_KEY)
            ?.let(PlaybackRequestValidator::key)
            ?: if (online) "youtube:${originalSource.hashCode()}" else "local:${offlineUri?.toString().orEmpty().hashCode()}"
        val requestedPosition = if (savedInstanceState == null) {
            intent.getLongExtra(EXTRA_POSITION_MS, 0L)
        } else {
            savedInstanceState.getLong(STATE_POSITION, 0L)
        }
        initialPositionMs = maxOf(requestedPosition, savedPosition())

        if (offlineUri == null && !online) {
            finish()
            return
        }
        if (online && PlaybackRequestValidator.onlineSource(originalSource) == null) {
            errorMessage = "This online playback request is not valid."
            finish()
            return
        }
        playback.session?.takeIf { it.key == mediaKey }?.let {
            playbackSpeed = player.playbackParameters.speed
            durationMs = player.duration.takeIf { it != C.TIME_UNSET } ?: 0L
        }
        player.addListener(playerListener)

        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = minimize()
        })

        setContent {
            MaterialTheme { VideoPlayerUi() }
        }

        if (playback.hasSession(mediaKey)) {
            isLoading = player.playbackState == Player.STATE_BUFFERING || player.playbackState == Player.STATE_IDLE
            isPlaying = player.isPlaying
        } else if (offlineUri != null) {
            prepare(offlineUri)
        } else {
            extractAndPrepare(originalSource)
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(value: Boolean) {
            isPlaying = value
            if (value) {
                playbackEnded = false
                errorMessage = null
                playback.errorMessage = null
            }
        }

        override fun onPlaybackStateChanged(state: Int) {
            isLoading = state == Player.STATE_BUFFERING || state == Player.STATE_IDLE
            if (state == Player.STATE_READY) {
                isLoading = false
                durationMs = player.duration.takeIf { it != C.TIME_UNSET } ?: 0L
            }
            if (state == Player.STATE_ENDED) {
                isLoading = false
                playbackEnded = true
                controlsVisible = true
                clearSavedPosition()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            isLoading = false
            controlsVisible = true
            errorMessage = if (online) {
                "The stream expired or could not be loaded."
            } else {
                "This downloaded file cannot be decoded on this device."
            }
            playback.errorMessage = errorMessage
        }
    }

    private fun prepare(uri: Uri) {
        errorMessage = null
        isLoading = true
        playbackEnded = false
        playback.prepare(
            NativePlaybackController.Session(
                key = mediaKey,
                uri = uri,
                online = online,
                sourceUrl = originalSource,
                title = videoTitle,
                thumbnail = intent.getStringExtra(EXTRA_THUMBNAIL).orEmpty(),
            ),
            positionMs = initialPositionMs,
            speed = preferredSpeed(),
            autoplay = true,
        )
    }

    private fun extractAndPrepare(sourceUrl: String) {
        errorMessage = null
        isLoading = true
        lifecycleScope.launch {
            val playableUrl = withContext(Dispatchers.IO) {
                val extractor = MediaExtractor(applicationContext)
                withTimeoutOrNull(30_000L) {
                    runCatching { extractor.extractPlayableUrl(sourceUrl) }.getOrNull()
                        ?: runCatching {
                            extractor.extractInfo(sourceUrl).formats.asSequence()
                                .filter { it.isProgressive && it.url.isNotBlank() }
                                .sortedWith(
                                    compareByDescending<FormatInfo> { it.ext.equals("mp4", ignoreCase = true) }
                                        .thenByDescending { it.height }
                                        .thenByDescending { it.effectiveFilesize },
                                )
                                .firstOrNull()?.url?.takeIf(String::isNotBlank)
                        }.getOrNull()
                }
            }
            if (isFinishing || isDestroyed) return@launch
            val validatedUrl = playableUrl?.let(PlaybackRequestValidator::onlineSource)
            if (validatedUrl == null) {
                isLoading = false
                controlsVisible = true
                errorMessage = "No playable stream was found. Check the connection and retry."
            } else {
                prepare(Uri.parse(validatedUrl))
            }
        }
    }

    @Composable
    private fun VideoPlayerUi() {
        val configuration = LocalConfiguration.current
        val density = LocalDensity.current.density
        val landscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        var scrubbing by remember { mutableStateOf(false) }
        var scrubPosition by remember { mutableFloatStateOf(0f) }
        var settingsMenuOpen by remember { mutableStateOf(false) }

        LaunchedEffect(Unit) {
            while (true) {
                if (!scrubbing) positionMs = player.currentPosition.coerceAtLeast(0L)
                durationMs = player.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: durationMs
                bufferedMs = player.bufferedPosition.coerceAtLeast(0L)
                delay(250L)
            }
        }
        LaunchedEffect(controlsVisible, isPlaying) {
            if (controlsVisible && isPlaying && errorMessage == null) {
                delay(3_000L)
                controlsVisible = false
            }
        }
        LaunchedEffect(gestureHint) {
            if (gestureHint != null) {
                delay(650L)
                gestureHint = null
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(ComposeColor.Black)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = { offset ->
                            if (locked) {
                                if (offset.y < 96.dp.value * density) locked = false
                            } else {
                                controlsVisible = !controlsVisible
                            }
                        },
                        onDoubleTap = { point ->
                            if (!locked) {
                                if (point.x < size.width / 2f) {
                                    player.seekBack()
                                    gestureHint = "−10 seconds"
                                } else {
                                    player.seekForward()
                                    gestureHint = "+10 seconds"
                                }
                                controlsVisible = true
                            }
                        },
                    )
                },
        ) {
            AndroidView(
                factory = { context ->
                    PlayerView(context).apply {
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        setShutterBackgroundColor(Color.BLACK)
                        player = this@NativeVideoPlayerActivity.player
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )

            if (!locked && controlsVisible) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(ComposeColor.Black.copy(alpha = 0.28f)),
                )
                TopControls()
                if (!isLoading && errorMessage == null) CenterControls()
                BottomControls(
                    landscape = landscape,
                    scrubbing = scrubbing,
                    scrubPosition = scrubPosition,
                    settingsMenuOpen = settingsMenuOpen,
                    onScrubbingChanged = { scrubbing = it },
                    onScrubPositionChanged = { scrubPosition = it },
                    onSettingsMenuChanged = { settingsMenuOpen = it },
                )
            }

            if (locked) {
                PlayerIconButton(
                    label = "Unlock player",
                    size = 52,
                    onClick = { locked = false },
                    modifier = Modifier.align(Alignment.TopEnd).padding(top = 22.dp, end = 14.dp),
                ) {
                    Icon(Icons.Default.Lock, contentDescription = null)
                }
            }

            if (isLoading) {
                CircularProgressIndicator(
                    color = Accent,
                    strokeWidth = 3.dp,
                    modifier = Modifier.size(44.dp).align(Alignment.Center),
                )
            }

            gestureHint?.let { hint ->
                Text(
                    text = hint,
                    color = ComposeColor.White,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .clip(RoundedCornerShape(18.dp))
                        .background(ComposeColor.Black.copy(alpha = 0.72f))
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                )
            }

            errorMessage?.let { message -> ErrorOverlay(message) }
        }
    }

    @Composable
    private fun TopControls() {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(if (online) RoundedCornerShape(bottomStart = 26.dp, bottomEnd = 26.dp) else RoundedCornerShape(0.dp))
                .background(
                    if (online) {
                        Brush.linearGradient(
                            listOf(
                                ComposeColor(0xCC211329),
                                ComposeColor(0x8A17101F),
                                ComposeColor.Transparent,
                            ),
                        )
                    } else {
                        Brush.verticalGradient(
                            listOf(ComposeColor.Black.copy(alpha = 0.9f), ComposeColor.Transparent),
                        )
                    }
                )
                .padding(start = 8.dp, end = 14.dp, top = 20.dp, bottom = 24.dp),
        ) {
            PlayerIconButton(label = "Back", onClick = { finish() }) {
                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
            }
            Text(
                text = videoTitle,
                color = ComposeColor.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            PlayerIconButton(label = "Close player", onClick = ::closePlayer) {
                Icon(Icons.Default.Close, contentDescription = null)
            }
            Text(
                text = if (online) "ONLINE" else "OFFLINE",
                color = Accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(ComposeColor.White.copy(alpha = 0.1f))
                    .padding(horizontal = 9.dp, vertical = 6.dp),
            )
        }
    }

    @Composable
    private fun BoxScope.CenterControls() {
        Row(
            horizontalArrangement = Arrangement.spacedBy(28.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.align(Alignment.Center),
        ) {
            PlayerIconButton(
                label = "Rewind 10 seconds",
                size = 52,
                onClick = {
                    player.seekBack()
                    controlsVisible = true
                },
            ) {
                Icon(Icons.Default.Replay10, contentDescription = null, modifier = Modifier.size(29.dp))
            }
            IconButton(
                onClick = {
                    if (playbackEnded) {
                        player.seekTo(0)
                        player.play()
                    } else if (player.isPlaying) {
                        player.pause()
                    } else {
                        player.play()
                    }
                    controlsVisible = true
                },
                modifier = Modifier
                    .size(66.dp)
                    .clip(CircleShape)
                    .background(
                        if (online) {
                            Brush.linearGradient(
                                listOf(ComposeColor(0xFFF05AA0), ComposeColor(0xFFD946EF), ComposeColor(0xFF8B5CF6)),
                            )
                        } else {
                            Brush.linearGradient(
                                listOf(ComposeColor.White.copy(alpha = 0.96f), ComposeColor.White.copy(alpha = 0.96f)),
                            )
                        },
                    )
                    .semantics { contentDescription = if (isPlaying) "Pause" else "Play" },
            ) {
                Icon(
                    imageVector = when {
                        playbackEnded -> Icons.Default.Replay
                        isPlaying -> Icons.Default.Pause
                        else -> Icons.Default.PlayArrow
                    },
                    contentDescription = null,
                    tint = if (online) ComposeColor.White else ComposeColor(0xFF101114),
                    modifier = Modifier.size(36.dp),
                )
            }
            PlayerIconButton(
                label = "Forward 10 seconds",
                size = 52,
                onClick = {
                    player.seekForward()
                    controlsVisible = true
                },
            ) {
                Icon(Icons.Default.Forward10, contentDescription = null, modifier = Modifier.size(29.dp))
            }
        }
    }

    @Composable
    private fun BoxScope.BottomControls(
        landscape: Boolean,
        scrubbing: Boolean,
        scrubPosition: Float,
        settingsMenuOpen: Boolean,
        onScrubbingChanged: (Boolean) -> Unit,
        onScrubPositionChanged: (Float) -> Unit,
        onSettingsMenuChanged: (Boolean) -> Unit,
    ) {
        val shownPosition = if (scrubbing) scrubPosition.toLong() else positionMs
        Column(
                modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .clip(if (online) RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp) else RoundedCornerShape(0.dp))
                .background(
                    if (online) {
                        Brush.verticalGradient(
                            listOf(
                                ComposeColor.Transparent,
                                ComposeColor(0xD9161020),
                                ComposeColor(0xF50B0910),
                            ),
                        )
                    } else {
                        Brush.verticalGradient(
                            listOf(ComposeColor.Transparent, ComposeColor.Black.copy(alpha = 0.94f)),
                        )
                    }
                )
                .padding(start = 14.dp, end = 10.dp, top = 30.dp, bottom = 12.dp),
        ) {
            Box(Modifier.fillMaxWidth()) {
                val bufferedFraction = if (durationMs > 0) bufferedMs.toFloat() / durationMs else 0f
                Box(
                    Modifier
                        .fillMaxWidth(bufferedFraction.coerceIn(0f, 1f))
                        .height(3.dp)
                        .align(Alignment.CenterStart)
                        .background(ComposeColor.White.copy(alpha = 0.32f)),
                )
                Slider(
                    value = shownPosition.toFloat().coerceIn(0f, durationMs.coerceAtLeast(1L).toFloat()),
                    onValueChange = {
                        onScrubbingChanged(true)
                        onScrubPositionChanged(it)
                    },
                    onValueChangeFinished = {
                        player.seekTo(scrubPosition.toLong())
                        onScrubbingChanged(false)
                    },
                    valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = Accent,
                        activeTrackColor = Accent,
                        inactiveTrackColor = ComposeColor.White.copy(alpha = 0.2f),
                    ),
                    modifier = Modifier.fillMaxWidth().height(30.dp),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${formatTime(shownPosition)} / ${formatTime(durationMs)}",
                    color = ComposeColor.White.copy(alpha = 0.88f),
                    fontSize = 12.sp,
                )
                Spacer(Modifier.weight(1f))
                PlayerIconButton(
                    label = if (muted) "Unmute" else "Mute",
                    size = 42,
                    onClick = {
                        muted = !muted
                        player.volume = if (muted) 0f else 1f
                    },
                ) {
                    Icon(if (muted) Icons.Default.VolumeOff else Icons.Default.VolumeUp, contentDescription = null)
                }
                Box {
                    PlayerIconButton(label = "Player settings", size = 42, onClick = { onSettingsMenuChanged(true) }) {
                        Icon(Icons.Default.Settings, contentDescription = null)
                    }
                    DropdownMenu(
                        expanded = settingsMenuOpen,
                        onDismissRequest = { onSettingsMenuChanged(false) },
                        modifier = Modifier.background(ComposeColor(0xFF202126)),
                    ) {
                        Text(
                            "Playback speed",
                            color = ComposeColor.White,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        )
                        SPEEDS.forEach { speed ->
                            DropdownMenuItem(
                                text = { Text(formatSpeed(speed), color = ComposeColor.White) },
                                onClick = {
                                    playbackSpeed = speed
                                    player.setPlaybackSpeed(speed)
                                    onSettingsMenuChanged(false)
                                },
                            )
                        }
                        qualityOptions().forEach { quality ->
                            DropdownMenuItem(
                                text = { Text(quality.second, color = ComposeColor.White) },
                                onClick = {
                                    selectQuality(quality.first)
                                    onSettingsMenuChanged(false)
                                },
                            )
                        }
                    }
                }
                PlayerIconButton(
                    label = if (locked) "Unlock player" else "Lock player",
                    size = 42,
                    onClick = { locked = !locked },
                ) {
                    Icon(if (locked) Icons.Default.LockOpen else Icons.Default.Lock, contentDescription = null)
                }
                PlayerIconButton(
                    label = if (landscape) "Exit fullscreen" else "Fullscreen",
                    size = 42,
                    onClick = {
                        requestedOrientation = if (landscape) {
                            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                        } else {
                            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                        }
                    },
                ) {
                    Icon(
                        if (landscape) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                        contentDescription = null,
                    )
                }
            }
        }
    }

    @Composable
    private fun BoxScope.ErrorOverlay(message: String) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(24.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(ComposeColor(0xEE17181D))
                .padding(horizontal = 24.dp, vertical = 20.dp),
        ) {
            Text("Playback problem", color = ComposeColor.White, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(7.dp))
            Text(
                message,
                color = ComposeColor.White.copy(alpha = 0.7f),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "RETRY",
                color = Accent,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(ComposeColor.White.copy(alpha = 0.08f))
                    .clickable { retry() }
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }
    }

    @Composable
    private fun PlayerIconButton(
        label: String,
        size: Int = 46,
        onClick: () -> Unit,
        modifier: Modifier = Modifier,
        content: @Composable () -> Unit,
    ) {
        val glassSurface = if (online) {
            Modifier
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(ComposeColor(0x8AFFFFFF), ComposeColor(0x241F1429)),
                    ),
                )
                .border(1.dp, ComposeColor.White.copy(alpha = 0.24f), CircleShape)
        } else {
            Modifier
        }
        IconButton(
            onClick = onClick,
            modifier = modifier.size(size.dp).then(glassSurface).semantics { contentDescription = label },
        ) {
            CompositionLocalProvider(LocalContentColor provides ComposeColor.White) { content() }
        }
    }

    private fun retry() {
        initialPositionMs = positionMs
        if (online) extractAndPrepare(originalSource)
        else playback.session?.uri?.let(::prepare)
    }

    private fun qualityOptions(): List<Pair<Int, String>> {
        val options = player.currentTracks.groups
            .filter { it.isTrackSelected(0) || it.mediaTrackGroup.getFormat(0).height > 0 }
            .flatMap { group -> (0 until group.mediaTrackGroup.length).map { group.mediaTrackGroup.getFormat(it).height } }
            .filter { it > 0 }
            .distinct()
            .sortedDescending()
        return options.map { it to "Quality · ${it}p" }
    }

    private fun selectQuality(height: Int) {
        val overrides = player.currentTracks.groups
            .filter { it.mediaTrackGroup.length > 0 }
            .flatMap { group ->
                (0 until group.mediaTrackGroup.length).filter {
                    group.mediaTrackGroup.getFormat(it).height == height
                }.map { group.mediaTrackGroup to it }
            }
        if (overrides.isEmpty()) return
        val builder = player.trackSelectionParameters.buildUpon().clearOverrides()
        overrides.firstOrNull()?.let { (group, index) ->
            builder.addOverride(androidx.media3.common.TrackSelectionOverride(group, index))
        }
        player.trackSelectionParameters = builder.build()
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
    }

    override fun onPause() {
        if (playback.session != null) {
            savePosition()
            savePreferredSpeed()
        }
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (playback.session != null) outState.putLong(STATE_POSITION, player.currentPosition)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (playback.session != null) {
            savePosition()
            player.removeListener(playerListener)
        }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onDestroy()
    }

    private fun preferenceKey(): String {
        return "position_${mediaKey.hashCode()}"
    }

    private fun savedPosition() = getSharedPreferences(PREFS, MODE_PRIVATE).getLong(preferenceKey(), 0L)

    private fun savePosition() {
        if (playback.session == null || playbackEnded) return
        val current = player.currentPosition.coerceAtLeast(0L)
        val duration = player.duration
        if (current > 2_000L && (duration == C.TIME_UNSET || current < duration - 5_000L)) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putLong(preferenceKey(), current).apply()
        }
    }

    private fun clearSavedPosition() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(preferenceKey()).apply()
    }

    private fun preferredSpeed(): Float = getSharedPreferences(PREFS, MODE_PRIVATE)
        .getFloat("speed_${mediaKey.hashCode()}", 1f)
        .coerceIn(0.25f, 2f)

    private fun savePreferredSpeed() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putFloat("speed_${mediaKey.hashCode()}", playbackSpeed)
            .apply()
    }

    private fun minimize() {
        savePosition()
        savePreferredSpeed()
        finish()
    }

    private fun closePlayer() {
        playback.stop()
        clearSavedPosition()
        finish()
    }

    private fun formatTime(milliseconds: Long): String {
        if (milliseconds <= 0 || milliseconds == C.TIME_UNSET) return "0:00"
        val totalSeconds = milliseconds / 1_000
        val hours = totalSeconds / 3_600
        val minutes = (totalSeconds % 3_600) / 60
        val seconds = totalSeconds % 60
        return if (hours > 0) {
            "$hours:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
        } else {
            "$minutes:${seconds.toString().padStart(2, '0')}"
        }
    }

    private fun formatSpeed(speed: Float) = if (speed == 1f) "1×" else "${speed}×"

    companion object {
        const val EXTRA_URI = "offline_media_uri"
        const val EXTRA_SOURCE_URL = "online_media_source_url"
        const val EXTRA_TITLE = "offline_media_title"
        const val EXTRA_POSITION_MS = "offline_media_position_ms"
        const val EXTRA_MEDIA_KEY = "native_media_key"
        const val EXTRA_THUMBNAIL = "native_media_thumbnail"
        private const val STATE_POSITION = "offline_media_saved_position"
        private const val PREFS = "reelhouse_native_player"
        private const val SEEK_INCREMENT_MS = 10_000L
        private val Accent = ComposeColor(0xFFFF5368)
        private val SPEEDS = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
    }
}
