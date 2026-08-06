package com.reelhouse.downloader.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel as composeViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil.compose.AsyncImage
import com.reelhouse.downloader.AnalysisState
import com.reelhouse.downloader.AppViewModel
import com.reelhouse.downloader.BuildConfig
import com.reelhouse.downloader.EngineUpdateState
import com.reelhouse.downloader.SettingsState
import com.reelhouse.downloader.data.DownloadEntity
import com.reelhouse.downloader.media.FormatInfo
import com.reelhouse.downloader.media.MediaInfo
import com.reelhouse.downloader.ReelhouseApp
import com.reelhouse.downloader.youtube.YouTubeViewModel
import com.reelhouse.downloader.util.SourcePlatform
import kotlinx.coroutines.delay

private data class Destination(val route: String, val label: String, val icon: ImageVector)

private val destinations = listOf(
    Destination("home", "Home", Icons.Default.Home),
    Destination("youtube", "YouTube", Icons.Default.PlayCircle),
    Destination("downloads", "Downloads", Icons.Default.Download),
    Destination("history", "History", Icons.Default.History),
    Destination("settings", "Settings", Icons.Default.Settings),
)

private val safeAudioBitrates = listOf(64, 96, 128, 160, 192, 256, 320)

@Composable
fun ReelhouseRoot(viewModel: AppViewModel) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val youtubeViewModel: YouTubeViewModel = composeViewModel(
        factory = YouTubeViewModel.Factory(context.applicationContext as ReelhouseApp),
    )

    LaunchedEffect(Unit) {
        viewModel.messages.collect { message ->
            snackbarHostState.showSnackbar(message)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            if (route in destinations.map { it.route }) {
                NavigationBar {
                    destinations.forEach { destination ->
                        NavigationBarItem(
                            selected = route == destination.route,
                            onClick = {
                                navController.navigate(destination.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(destination.icon, null) },
                            label = { Text(destination.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(padding),
        ) {
            composable("home") {
                val state by viewModel.analysis.collectAsStateWithLifecycle()
                val recent by viewModel.recentDownloads.collectAsStateWithLifecycle()
                HomeScreen(
                    state = state,
                    recent = recent,
                    onUrlChange = viewModel::setUrl,
                    onClear = viewModel::clearUrl,
                    onAnalyze = {
                        viewModel.analyze()
                    },
                    onDetailsReady = { navController.navigate("details") },
                    onOpen = {
                        val opened = viewModel.open(it)?.let(context::startSafely) == true
                        if (!opened) viewModel.reportFileActionFailure()
                    },
                )
            }
            composable("details") {
                val state by viewModel.analysis.collectAsStateWithLifecycle()
                val settings by viewModel.settings.collectAsStateWithLifecycle()
                DetailsScreen(
                    state = state,
                    settings = settings,
                    filenamePreview = viewModel::filenamePreview,
                    onBack = { navController.popBackStack() },
                    onStart = { media, audio, height, bitrate, format, label, expectedBytes ->
                        if (viewModel.startDownload(
                                media,
                                audio,
                                height,
                                bitrate,
                                format,
                                label,
                                expectedBytes,
                            ) != null
                        ) {
                            navController.navigate("downloads")
                        }
                    },
                )
            }
            composable("youtube") {
                val youtubeState by youtubeViewModel.state.collectAsStateWithLifecycle()
                YouTubeWorkspaceScreen(
                    state = youtubeState,
                    onTopic = youtubeViewModel::loadTopic,
                    onSearch = youtubeViewModel::search,
                    onVideo = { video ->
                        youtubeViewModel.selectVideo(video)
                        navController.navigate("youtube/watch")
                    },
                )
            }
            composable("youtube/watch") {
                val youtubeState by youtubeViewModel.state.collectAsStateWithLifecycle()
                val localFallback = youtubeState.localFallback
                LaunchedEffect(localFallback?.token) {
                    if (localFallback != null) {
                        val video = localFallback.video
                        val started = viewModel.startDirectVideoDownload(
                            url = video.sourceUrl,
                            sourceId = video.id,
                            title = video.title,
                            uploader = video.channel,
                            thumbnail = video.thumbnail,
                            quality = localFallback.quality,
                        )
                        youtubeViewModel.consumeLocalFallback()
                        if (started != null) navController.navigate("downloads")
                    }
                }
                YouTubeWatchScreen(
                    state = youtubeState,
                    onBack = { navController.popBackStack() },
                    onQuality = youtubeViewModel::setQuality,
                    onDownload = youtubeViewModel::startLocalDownload,
                    onDismissDownload = youtubeViewModel::clearDownloadStatus,
                )
            }
            composable("downloads") {
                val active by viewModel.activeDownloads.collectAsStateWithLifecycle()
                val history by viewModel.history.collectAsStateWithLifecycle()
                ActiveDownloadsScreen(
                    downloads = active,
                    failed = history.filter { it.status == DownloadEntity.Status.FAILED }.take(5),
                    onCancel = viewModel::cancelDownload,
                    onRetry = viewModel::retryDownload,
                )
            }
            composable("history") {
                val history by viewModel.history.collectAsStateWithLifecycle()
                HistoryScreen(
                    history = history,
                    onOpen = {
                        val opened = viewModel.open(it)?.let(context::startSafely) == true
                        if (!opened) viewModel.reportFileActionFailure()
                    },
                    onShare = {
                        val shared = viewModel.share(it)?.let(context::startSafely) == true
                        if (!shared) viewModel.reportFileActionFailure()
                    },
                    onDeleteFile = viewModel::deleteFile,
                    onRemove = viewModel::removeHistory,
                    onClear = viewModel::clearHistory,
                )
            }
            composable("settings") {
                val settings by viewModel.settings.collectAsStateWithLifecycle()
                val updateState by viewModel.updateState.collectAsStateWithLifecycle()
                SettingsScreen(
                    state = settings,
                    updateState = updateState,
                    viewModel = viewModel,
                    onLicences = { navController.navigate("licences") },
                    onLegal = { navController.navigate("legal") },
                )
            }
            composable("licences") {
                val fullGplText = remember {
                    runCatching {
                        context.assets.open("COPYING").bufferedReader().use { it.readText() }
                    }.getOrElse {
                        "The bundled GPL-3.0 text could not be displayed. See the Android project COPYING file."
                    }
                }
                NoticeScreen(
                    title = "Open-source licences",
                    body = "$LICENSE_TEXT\n\nGNU General Public License version 3\n\n$fullGplText",
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal") {
                NoticeScreen(
                    title = "Privacy & legal",
                    body = LEGAL_TEXT,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

private fun Context.startSafely(intent: Intent): Boolean =
    try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) {
        false
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(
    state: AnalysisState,
    recent: List<DownloadEntity>,
    onUrlChange: (String) -> Unit,
    onClear: () -> Unit,
    onAnalyze: () -> Unit,
    onDetailsReady: () -> Unit,
    onOpen: (DownloadEntity) -> Unit,
) {
    val context = LocalContext.current
    var navigatedMediaId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state.media) {
        val mediaId = state.media?.id
        if (mediaId != null && mediaId != navigatedMediaId) {
            navigatedMediaId = mediaId
            onDetailsReady()
        }
    }
    Scaffold(topBar = { TopAppBar(title = { Text("Reelhouse") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Text("Download on this device", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Analysis, downloads, and optional media merging run locally. The website backend is not used.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                OutlinedTextField(
                    value = state.url,
                    onValueChange = onUrlChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Media URL") },
                    placeholder = { Text("https://…") },
                    singleLine = true,
                    supportingText = state.error?.let { error ->
                        { Text(error, color = MaterialTheme.colorScheme.error) }
                    },
                    trailingIcon = {
                        if (state.url.isNotBlank()) {
                            IconButton(onClick = onClear) { Icon(Icons.Default.Clear, "Clear") }
                        }
                    },
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()?.let(onUrlChange)
                    }) {
                        Icon(Icons.Default.ContentPaste, null)
                        Spacer(Modifier.size(8.dp))
                        Text("Paste")
                    }
                    Button(
                        onClick = {
                            navigatedMediaId = null
                            onAnalyze()
                        },
                        enabled = !state.loading && state.url.isNotBlank(),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (state.loading) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.size(8.dp))
                            Text("Analyzing…")
                        } else {
                            Text("Analyze locally")
                        }
                    }
                }
            }
            item { SectionTitle("Recent downloads") }
            if (recent.isEmpty()) {
                item { EmptyCard("Completed downloads will appear here.") }
            } else {
                items(recent, key = { it.id }) { item ->
                    DownloadListItem(item = item, action = {
                        IconButton(onClick = { onOpen(item) }) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, "Open")
                        }
                    })
                }
            }
            item {
                Card {
                    Text(
                        "Only download media you own, created, have permission to download, or that the platform explicitly permits.",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

private data class DownloadChoice(
    val media: MediaInfo,
    val audio: Boolean,
    val height: Int?,
    val audioBitrate: Int?,
    val format: String,
    val label: String,
    val expectedBytes: Long,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailsScreen(
    state: AnalysisState,
    settings: SettingsState,
    filenamePreview: (MediaInfo, String) -> String,
    onBack: () -> Unit,
    onStart: (MediaInfo, Boolean, Int?, Int?, String, String, Long) -> Unit,
) {
    val media = state.media
    var audioOnly by rememberSaveable(media?.id) { mutableStateOf(settings.downloadType == "audio") }
    val videoFormats = remember(media) {
        val available = media?.formats.orEmpty()
        val videoOnly = available.filter { it.isVideoOnly && it.height > 0 }
        (videoOnly.ifEmpty { available.filter { it.hasVideo && it.height > 0 } })
            .sortedByDescending { it.height }.distinctBy { it.height }
    }
    val audioFormats = remember(media) {
        media?.formats.orEmpty().filter { it.isAudioOnly }
            .sortedByDescending { it.abr }.distinctBy { it.abr.toInt() }
    }
    val audioChoices = remember(media) {
        audioFormats.mapNotNull { format ->
            if (format.abr <= 0) null else {
                val safeBitrate = safeAudioBitrates.minByOrNull {
                    kotlin.math.abs(format.abr - it)
                }
                safeBitrate?.let { it to format }
            }
        }.distinctBy { it.first }
    }
    var height by rememberSaveable(media?.id) {
        mutableStateOf(settings.videoQuality.toIntOrNull())
    }
    var audioBitrate by rememberSaveable(media?.id) {
        mutableStateOf(settings.audioQuality.toIntOrNull())
    }
    var outputFormat by rememberSaveable(media?.id, audioOnly) {
        mutableStateOf(
            if (audioOnly) settings.audioQuality.takeIf { it in setOf("m4a", "mp3", "opus") } ?: "m4a"
            else "mp4"
        )
    }
    var confirming by remember { mutableStateOf(false) }
    val youtubeVideo = SourcePlatform.isYouTube(media?.webpageUrl.orEmpty()) ||
        media?.platform.equals("YouTube", ignoreCase = true)

    fun submit(choice: DownloadChoice) {
        onStart(
            choice.media,
            choice.audio,
            choice.height,
            choice.audioBitrate,
            choice.format,
            choice.label,
            choice.expectedBytes,
        )
    }
    val selectedAudioFormat = if (audioBitrate == null) {
        audioFormats.firstOrNull()
    } else {
        audioFormats.filter { it.abr <= audioBitrate!!.toDouble() }
            .maxByOrNull { it.abr }
            ?: audioFormats.firstOrNull()
    }
    val expectedBytes = if (audioOnly) {
        selectedAudioFormat?.effectiveFilesize ?: 0L
    } else {
        val video = height?.let { selected -> videoFormats.firstOrNull { it.height == selected } }
            ?: videoFormats.firstOrNull()
        val separateAudioSize = if (video?.hasAudio == true) 0L
            else audioFormats.firstOrNull()?.effectiveFilesize ?: 0L
        (video?.effectiveFilesize ?: 0L) + separateAudioSize
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Media details") },
            navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
        )
    }) { padding ->
        if (media == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Analyze a URL from Home first.")
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                AsyncImage(
                    model = media.thumbnail,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().height(210.dp),
                )
                Spacer(Modifier.height(12.dp))
                Text(media.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("${media.displayUploader} · ${media.platform} · ${media.durationFormatted}")
            }
            if (youtubeVideo) item {
                SectionTitle("Download type")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !audioOnly, onClick = {
                        audioOnly = false
                        outputFormat = "mp4"
                    }, label = { Text("Video") })
                    FilterChip(selected = audioOnly, onClick = {
                        audioOnly = true
                        outputFormat = "m4a"
                    }, label = { Text("Audio only") })
                }
            }
            if (youtubeVideo) item { SectionTitle(if (audioOnly) "Available audio qualities" else "Available video qualities") }
            if (youtubeVideo && !audioOnly) {
                item {
                    ChoiceRow(selected = height == null, label = "Best available", note = "Size determined by source") {
                        height = null
                    }
                }
                items(videoFormats, key = { it.height }) { format ->
                    ChoiceRow(
                        selected = height == format.height,
                        label = format.qualityLabel,
                        note = "${format.ext.uppercase()} · ${format.filesizeFormatted}",
                    ) { height = format.height }
                }
            } else if (youtubeVideo) {
                item {
                    ChoiceRow(
                        selected = audioBitrate == null,
                        label = "Best available",
                        note = selectedAudioFormat?.filesizeFormatted ?: "Size determined by source",
                    ) { audioBitrate = null }
                }
                if (audioFormats.isEmpty()) {
                    item { EmptyCard("No bitrate list was provided; best available audio will be selected.") }
                } else {
                    items(audioChoices.take(8), key = { it.first }) { (safeBitrate, format) ->
                        ChoiceRow(
                            selected = audioBitrate == safeBitrate,
                            label = "$safeBitrate kbps",
                            note = "${format.ext.uppercase()} · ${format.filesizeFormatted}",
                        ) { audioBitrate = safeBitrate }
                    }
                }
            }
            if (!youtubeVideo) item {
                Text(
                    "Best available quality will be downloaded automatically for ${media.platform.ifBlank { "this platform" }}.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                SectionTitle("Output format")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (if (audioOnly) listOf("m4a", "mp3", "opus") else listOf("mp4", "mkv", "webm")).forEach { format ->
                        FilterChip(
                            selected = outputFormat == format,
                            onClick = { outputFormat = format },
                            label = { Text(format.uppercase()) },
                        )
                    }
                }
            }
            item {
                Text("Filename preview", fontWeight = FontWeight.SemiBold)
                Text(filenamePreview(media, outputFormat), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    if (!youtubeVideo || settings.directory == "media") {
                        if (audioOnly) "Saved to Music/Reelhouse" else "Saved to Movies/Reelhouse"
                    } else "Saved to Downloads/Reelhouse",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            item {
                Button(onClick = {
                    confirming = true
                }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Download, null)
                    Spacer(Modifier.size(8.dp))
                    Text("Confirm local download")
                }
            }
        }
    }

    if (confirming && media != null) {
        val label = if (audioOnly) {
            "Audio ${audioBitrate?.let { "${it} kbps" } ?: "best"} · ${outputFormat.uppercase()}"
        } else {
            "${height?.let { "${it}p" } ?: "Best"} · ${outputFormat.uppercase()}"
        }
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Start download?") },
            text = { Text("The source will send media directly to this phone. Railway is not contacted.\n\n${filenamePreview(media, outputFormat)}") },
            confirmButton = {
                Button(onClick = {
                    confirming = false
                    val choice = DownloadChoice(
                        media,
                        audioOnly,
                        height,
                        audioBitrate,
                        outputFormat,
                        label,
                        expectedBytes,
                    )
                    submit(choice)
                }) { Text("Download") }
            },
            dismissButton = { TextButton(onClick = { confirming = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ChoiceRow(selected: Boolean, label: String, note: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = selected, onClick = onClick)
            Column(Modifier.weight(1f)) {
                Text(label, fontWeight = FontWeight.SemiBold)
                Text(note, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ActiveDownloadsScreen(
    downloads: List<DownloadEntity>,
    failed: List<DownloadEntity>,
    onCancel: (String) -> Unit,
    onRetry: (DownloadEntity) -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Active downloads") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (downloads.isEmpty()) item { EmptyCard("No active downloads. Downloads do not survive force-stop or reboot.") }
            items(downloads, key = { it.id }) { item ->
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AsyncImage(
                                model = item.thumbnail,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                            )
                            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                                Text(item.title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                                Text(item.status.replaceFirstChar { it.uppercase() })
                            }
                        }
                        LinearProgressIndicator(progress = { item.progress }, modifier = Modifier.fillMaxWidth())
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${(item.progress * 100).toInt()}%")
                            val transferred = when {
                                item.downloadedBytes > 0 && item.totalBytes > 0 ->
                                    "${item.downloadedFormatted} / ${item.totalFormatted}"
                                item.downloadedBytes > 0 -> item.downloadedFormatted
                                item.totalBytes > 0 -> "Total ${item.totalFormatted}"
                                else -> ""
                            }
                            Text(listOf(item.speedFormatted, transferred, item.etaFormatted).filter { it.isNotBlank() }.joinToString(" · "))
                        }
                        OutlinedButton(onClick = { onCancel(item.id) }) { Text("Cancel") }
                    }
                }
            }
            if (failed.isNotEmpty()) {
                item { SectionTitle("Recent failures") }
                items(failed, key = { it.id }) { item ->
                    Card {
                        Column(Modifier.padding(16.dp)) {
                            Text(item.title, fontWeight = FontWeight.Bold)
                            Text(item.errorMessage ?: "Download failed", color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = { onRetry(item) }) {
                                Icon(Icons.Default.Refresh, null)
                                Text(" Retry")
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryScreen(
    history: List<DownloadEntity>,
    onOpen: (DownloadEntity) -> Unit,
    onShare: (DownloadEntity) -> Unit,
    onDeleteFile: (DownloadEntity) -> Unit,
    onRemove: (DownloadEntity) -> Unit,
    onClear: () -> Unit,
) {
    var deleteFile by remember { mutableStateOf<DownloadEntity?>(null) }
    var clearConfirm by remember { mutableStateOf(false) }
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("History") },
            actions = { if (history.isNotEmpty()) IconButton(onClick = { clearConfirm = true }) { Icon(Icons.Default.Delete, "Clear history") } },
        )
    }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (history.isEmpty()) item { EmptyCard("No completed, failed, or cancelled downloads yet.") }
            items(history, key = { it.id }) { item ->
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        DownloadListItem(item)
                        Text(item.completedAt?.let { java.text.DateFormat.getDateTimeInstance().format(java.util.Date(it)) } ?: "")
                        if (item.status == DownloadEntity.Status.COMPLETE && item.savedLocation.isNotBlank()) {
                            Text(
                                "Saved to ${item.savedLocation}/${item.savedDisplayName}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (item.errorMessage != null) Text(item.errorMessage, color = MaterialTheme.colorScheme.error)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (item.status == DownloadEntity.Status.COMPLETE && item.contentUri != null) {
                                IconButton(onClick = { onOpen(item) }) {
                                    Icon(Icons.AutoMirrored.Filled.OpenInNew, "Open")
                                }
                                IconButton(onClick = { onShare(item) }) { Icon(Icons.Default.Share, "Share") }
                                IconButton(onClick = { deleteFile = item }) { Icon(Icons.Default.Delete, "Delete file") }
                            }
                            TextButton(onClick = { onRemove(item) }) { Text("Remove entry") }
                        }
                    }
                }
            }
        }
    }
    deleteFile?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteFile = null },
            title = { Text("Delete downloaded file?") },
            text = { Text("This permanently deletes the media file and removes its history entry.") },
            confirmButton = { Button(onClick = { onDeleteFile(item); deleteFile = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleteFile = null }) { Text("Cancel") } },
        )
    }
    if (clearConfirm) {
        AlertDialog(
            onDismissRequest = { clearConfirm = false },
            title = { Text("Clear history?") },
            text = { Text("Downloaded files will remain on the device.") },
            confirmButton = { Button(onClick = { onClear(); clearConfirm = false }) { Text("Clear") } },
            dismissButton = { TextButton(onClick = { clearConfirm = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsScreen(
    state: SettingsState,
    updateState: EngineUpdateState,
    viewModel: AppViewModel,
    onLicences: () -> Unit,
    onLegal: () -> Unit,
) {
    var engineVersion by remember { mutableStateOf("Loading…") }
    var clearConfirm by remember { mutableStateOf(false) }
    LaunchedEffect(updateState) { engineVersion = viewModel.currentEngineVersion() }
    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionTitle("Defaults")
            SettingChoices("Download type", state.downloadType, listOf("video", "audio"), viewModel::setDownloadType)
            SettingChoices("Video quality", state.videoQuality, listOf("best", "1080", "720", "480"), viewModel::setVideoQuality)
            SettingChoices("Audio quality", state.audioQuality, listOf("best", "128", "192", "256", "320"), viewModel::setAudioQuality)
            SettingChoices("Save location", state.directory, listOf("downloads", "media"), viewModel::setDirectory)
            SettingSwitch("Wi-Fi-only downloads", "Reject new jobs unless Wi-Fi is active.", state.wifiOnly, viewModel::setWifiOnly)
            SettingSwitch("Completion notifications", "Foreground progress remains required by Android.", state.notifications, viewModel::setNotifications)
            HorizontalDivider()
            SectionTitle("Download engine")
            Text("yt-dlp: $engineVersion")
            Text(
                "Updates are explicit and verified against the official release SHA-256 manifest. The bundled engine remains the fallback.",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = viewModel::updateEngine, enabled = updateState != EngineUpdateState.Updating) {
                if (updateState == EngineUpdateState.Updating) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Icon(Icons.Default.Refresh, null)
                Text(if (updateState == EngineUpdateState.Updating) " Checking…" else " Check for verified update")
            }
            OutlinedButton(onClick = viewModel::restoreBundledEngine, enabled = updateState != EngineUpdateState.Updating) {
                Text("Restore bundled engine")
            }
            when (updateState) {
                is EngineUpdateState.Done -> Text(updateState.message, color = MaterialTheme.colorScheme.primary)
                is EngineUpdateState.Failed -> Text(updateState.message, color = MaterialTheme.colorScheme.error)
                else -> Unit
            }
            HorizontalDivider()
            Text("App version ${BuildConfig.VERSION_NAME}")
            ListItem(headlineContent = { Text("Open-source licences") }, leadingContent = { Icon(Icons.Default.Info, null) }, modifier = Modifier.fillMaxWidth())
            OutlinedButton(onClick = onLicences) { Text("View licences") }
            OutlinedButton(onClick = onLegal) { Text("Privacy & legal notice") }
            OutlinedButton(onClick = { clearConfirm = true }) { Text("Clear history (keep files)") }
            Text("Active downloads continue while the app is minimized, but not after force-stop or reboot.", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (clearConfirm) {
        AlertDialog(
            onDismissRequest = { clearConfirm = false },
            title = { Text("Clear history?") },
            text = { Text("Downloaded files will remain on the device.") },
            confirmButton = {
                Button(onClick = {
                    viewModel.clearHistory()
                    clearConfirm = false
                }) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { clearConfirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SettingChoices(title: String, value: String, choices: List<String>, onChange: (String) -> Unit) {
    Text(title, fontWeight = FontWeight.SemiBold)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        choices.forEach { choice ->
            val label = if (title == "Audio quality" && choice != "best") "$choice kbps"
                else choice.replaceFirstChar { it.uppercase() }
            FilterChip(selected = value == choice, onClick = { onChange(choice) }, label = { Text(label) })
        }
    }
}

@Composable
private fun SettingSwitch(title: String, summary: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(summary, style = MaterialTheme.typography.bodySmall)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NoticeScreen(title: String, body: String, onBack: () -> Unit) {
    Scaffold(topBar = {
        TopAppBar(title = { Text(title) }, navigationIcon = { TextButton(onClick = onBack) { Text("Back") } })
    }) { padding ->
        Text(body, modifier = Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(20.dp))
    }
}

@Composable
private fun DownloadListItem(item: DownloadEntity, action: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(model = item.thumbnail, contentDescription = null, modifier = Modifier.size(64.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(item.title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
            Text(listOf(item.formatLabel, item.fileSizeFormatted, item.status).filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
        }
        action?.invoke()
    }
}

@Composable
private fun EmptyCard(message: String) {
    Card(Modifier.fillMaxWidth()) { Text(message, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}

private const val LICENSE_TEXT = """Reelhouse Android uses youtubedl-android and its FFmpeg module under GPL-3.0. yt-dlp is distributed under The Unlicense. FFmpeg and its enabled components retain their respective LGPL/GPL-compatible licences. AndroidX, Jetpack Compose, Kotlin, Coil, Room, and kotlinx.coroutines/serialization retain their respective Apache 2.0 licences.

The complete dependency notices and corresponding source obligations must accompany any distributed APK. Project sources and exact dependency versions are the authoritative record. youtubedl-android: https://github.com/yausername/youtubedl-android · yt-dlp: https://github.com/yt-dlp/yt-dlp · FFmpeg: https://ffmpeg.org"""

private const val LEGAL_TEXT = """Use this application only to download media that you own, created, have permission to download, or that the platform explicitly permits you to download.

Do not use it to bypass copyright restrictions, subscriptions, DRM, authentication, or access controls. Public unauthenticated content is the only supported mode. No browser cookies or account credentials are collected.

The Home downloader passes media URLs only to the embedded local yt-dlp runtime. Its extraction, downloading, and FFmpeg processing occur on this Android device using its network connection. Thumbnail images are loaded directly from the source URL returned by yt-dlp.

The YouTube workspace sends public search terms and video requests directly from this device through the embedded local yt-dlp runtime. Metadata extraction, quality selection, downloading, and FFmpeg processing occur on this Android device using its network connection. The custom watch screen loads YouTube's official embedded player for online playback. YouTube receives the network requests required for these features; the Reelhouse server is not part of the Android media path.

Download-engine updates occur only after an explicit action. The app fetches the official yt-dlp stable release and verifies the component against that release's SHA-256 manifest before installation. Extraction can still break when source platforms change.

You are responsible for complying with applicable law and platform terms. The app does not circumvent DRM."""
