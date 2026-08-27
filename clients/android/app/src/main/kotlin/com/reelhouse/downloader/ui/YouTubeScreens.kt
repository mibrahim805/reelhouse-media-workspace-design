package com.reelhouse.downloader.ui

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import coil.compose.AsyncImage
import androidx.compose.ui.res.stringResource
import com.reelhouse.downloader.R
import com.reelhouse.downloader.youtube.BackendDownloadPhase
import com.reelhouse.downloader.youtube.BackendVideo
import com.reelhouse.downloader.youtube.YouTubeState
import com.reelhouse.downloader.youtube.YouTubeUrls
import com.reelhouse.downloader.youtube.youtubeTopics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YouTubeWorkspaceScreen(
    state: YouTubeState,
    onTopic: (String) -> Unit,
    onSearch: (String) -> Unit,
    onVideo: (BackendVideo) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }

    Scaffold(topBar = { TopAppBar(title = { Text("${stringResource(R.string.app_name)} YouTube") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Search videos") },
                    singleLine = true,
                )
                IconButton(onClick = { onSearch(query) }, enabled = query.isNotBlank()) {
                    Icon(Icons.Default.Search, contentDescription = "Search")
                }
            }

            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(youtubeTopics) { topic ->
                    FilterChip(
                        selected = state.query.isBlank() && state.topic == topic,
                        onClick = {
                            query = ""
                            onTopic(topic)
                        },
                        label = { Text(topic) },
                    )
                }
            }

            state.error?.let { error ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp)
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        error,
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    IconButton(
                        onClick = {
                            if (state.query.isBlank()) onTopic(state.topic) else onSearch(state.query)
                        },
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Retry")
                    }
                }
            }

            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(10.dp))
                        Text(
                            if (state.query.isBlank()) "Loading ${state.topic}…"
                            else "Searching for “${state.query}”…",
                        )
                    }
                }

                state.videos.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No videos found.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item {
                        Text(
                            if (state.query.isBlank()) "Recommended" else "Results for “${state.query}”",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    items(state.videos, key = { it.id.ifBlank { it.sourceUrl } }) { video ->
                        VideoFeedCard(video = video, onClick = { onVideo(video) })
                    }
                }
            }
        }
    }
}

@Composable
private fun VideoFeedCard(video: BackendVideo, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        AsyncImage(
            model = video.thumbnail,
            contentDescription = video.title,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        )
        Column(Modifier.padding(12.dp)) {
            Text(
                video.title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "${video.channel} · ${video.duration}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YouTubeWatchScreen(
    state: YouTubeState,
    onBack: () -> Unit,
    onQuality: (String) -> Unit,
    onDownload: () -> Unit,
    onDismissDownload: () -> Unit,
) {
    val video = state.selectedVideo
    var playing by rememberSaveable(video?.id) { mutableStateOf(true) }
    LaunchedEffect(video?.id) { playing = true }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Watch") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (video == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Select a video from the YouTube workspace.")
            }
            return@Scaffold
        }

        val videoId = video.id.ifBlank { YouTubeUrls.videoId(video.sourceUrl).orEmpty() }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    if (playing && videoId.isNotBlank()) {
                        YouTubeEmbedPlayer(videoId = videoId)
                    } else {
                        AsyncImage(
                            model = video.thumbnail,
                            contentDescription = video.title,
                            modifier = Modifier.fillMaxSize(),
                        )
                        IconButton(
                            onClick = { playing = true },
                            modifier = Modifier
                                .size(72.dp)
                                .background(MaterialTheme.colorScheme.primary, MaterialTheme.shapes.extraLarge),
                        ) {
                            Icon(
                                Icons.Default.PlayArrow,
                                contentDescription = "Play video",
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(42.dp),
                            )
                        }
                    }
                }
            }

            item {
                Button(
                    onClick = onDownload,
                    enabled = state.download.phase !in setOf(
                        BackendDownloadPhase.STARTING,
                        BackendDownloadPhase.DOWNLOADING,
                        BackendDownloadPhase.PROCESSING,
                        BackendDownloadPhase.SAVING,
                    ),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                ) {
                    Icon(Icons.Default.Download, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Download video")
                }
            }

            item {
                Column(Modifier.padding(horizontal = 12.dp)) {
                    Text(video.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "${video.channel} · ${video.duration}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (state.watchLoading) {
                item {
                    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.size(8.dp))
                        Text("Loading qualities on this phone…")
                    }
                }
            }

            state.watchError?.let { error ->
                item {
                    Text(
                        error,
                        modifier = Modifier.padding(horizontal = 12.dp),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            if (video.qualities.isNotEmpty()) {
                item {
                    Text(
                        "Download quality",
                        modifier = Modifier.padding(horizontal = 12.dp),
                        fontWeight = FontWeight.Bold,
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(video.qualities, key = { it.value }) { quality ->
                            FilterChip(
                                selected = state.selectedQuality == quality.value,
                                onClick = { onQuality(quality.value) },
                                label = { Text(quality.label) },
                            )
                        }
                    }
                }
            }

            if (state.download.phase != BackendDownloadPhase.IDLE) {
                item {
                    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                        Column(Modifier.padding(14.dp)) {
                            Text(state.download.message, fontWeight = FontWeight.SemiBold)
                            if (state.download.phase in setOf(
                                    BackendDownloadPhase.STARTING,
                                    BackendDownloadPhase.DOWNLOADING,
                                    BackendDownloadPhase.PROCESSING,
                                    BackendDownloadPhase.SAVING,
                                )
                            ) {
                                Spacer(Modifier.height(8.dp))
                                LinearProgressIndicator(
                                    progress = { state.download.percent / 100f },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            if (state.download.phase in setOf(
                                    BackendDownloadPhase.COMPLETE,
                                    BackendDownloadPhase.ERROR,
                                )
                            ) {
                                TextButton(onClick = onDismissDownload) { Text("Dismiss") }
                            }
                        }
                    }
                }
            }

        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun YouTubeEmbedPlayer(
    videoId: String,
) {
    val embedUrl = remember(videoId) { YouTubeUrls.embedUrl(videoId).orEmpty() }
    val playerDocument = remember(embedUrl) { playerHtml(embedUrl) }
    var webView by remember { mutableStateOf<WebView?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                loadUrl("about:blank")
                destroy()
            }
            webView = null
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                webView = this
                tag = videoId
                setBackgroundColor(AndroidColor.BLACK)
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    allowFileAccess = false
                    allowContentAccess = false
                }
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                webChromeClient = WebChromeClient()
                webViewClient = WebViewClient()
                loadDataWithBaseURL(
                    "https://www.youtube.com/",
                    playerDocument,
                    "text/html",
                    "UTF-8",
                    null,
                )
            }
        },
        update = { view ->
            if (view.tag != videoId) {
                view.tag = videoId
                view.loadDataWithBaseURL(
                    "https://www.youtube.com/",
                    playerDocument,
                    "text/html",
                    "UTF-8",
                    null,
                )
            }
        },
    )
}

private fun playerHtml(embedUrl: String) = """
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          html,body,iframe {
            position:fixed; inset:0; margin:0; width:100%; height:100%;
            border:0; overflow:hidden; background:#000;
          }
        </style>
      </head>
      <body>
        <iframe
          id="player"
          src="$embedUrl"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen>
        </iframe>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              events: {
                onStateChange: function(event) {
                  if (event.data === 0) {
                    document.body.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#fff;background:#000;font:16px sans-serif">Video ended</div>';
                  }
                }
              }
            });
          }
        </script>
      </body>
    </html>
""".trimIndent()
