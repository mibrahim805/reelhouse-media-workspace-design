package com.reelhouse.downloader.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.reelhouse.downloader.youtube.YouTubeUrlPolicy

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YouTubeBrowserScreen(onDownloadVideo: (String) -> Unit) {
    var browser by remember { mutableStateOf<WebView?>(null) }
    var currentUrl by remember { mutableStateOf(YouTubeUrlPolicy.HOME_URL) }
    var canGoBack by remember { mutableStateOf(false) }
    var progress by remember { mutableIntStateOf(0) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var customView by remember { mutableStateOf<View?>(null) }
    var customViewCallback by remember {
        mutableStateOf<WebChromeClient.CustomViewCallback?>(null)
    }

    val downloadUrl = remember(currentUrl) {
        YouTubeUrlPolicy.canonicalVideoUrl(currentUrl)
    }

    fun closeCustomView() {
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        customView = null
    }

    BackHandler(enabled = customView != null || canGoBack) {
        if (customView != null) {
            closeCustomView()
        } else {
            browser?.goBack()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
            customView = null
            browser?.apply {
                stopLoading()
                webChromeClient = null
                webViewClient = WebViewClient()
                destroy()
            }
            browser = null
        }
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("YouTube") },
                    navigationIcon = {
                        IconButton(
                            onClick = { browser?.goBack() },
                            enabled = canGoBack,
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back in YouTube",
                            )
                        }
                    },
                    actions = {
                        IconButton(
                            onClick = {
                                errorMessage = null
                                browser?.reload()
                            },
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Reload YouTube")
                        }
                        IconButton(
                            onClick = {
                                errorMessage = null
                                browser?.loadUrl(YouTubeUrlPolicy.HOME_URL)
                            },
                        ) {
                            Icon(Icons.Default.Home, contentDescription = "YouTube home")
                        }
                        IconButton(
                            onClick = { downloadUrl?.let(onDownloadVideo) },
                            enabled = downloadUrl != null,
                        ) {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = "Download this video",
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                if (progress in 1..99) {
                    LinearProgressIndicator(
                        progress = { progress / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                errorMessage?.let { message ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.errorContainer)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = message,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = {
                            errorMessage = null
                            browser?.reload()
                        }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Retry")
                        }
                    }
                }
                AndroidView(
                    modifier = Modifier.weight(1f),
                    factory = { context ->
                        WebView(context).apply webView@ {
                            browser = this
                            settings.apply {
                                javaScriptEnabled = true
                                domStorageEnabled = true
                                mediaPlaybackRequiresUserGesture = true
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                allowFileAccess = false
                                allowContentAccess = false
                                setSupportMultipleWindows(false)
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                settings.safeBrowsingEnabled = true
                            }
                            CookieManager.getInstance().apply {
                                setAcceptCookie(true)
                                setAcceptThirdPartyCookies(this@webView, true)
                            }
                            webViewClient = reelhouseWebViewClient(
                                context = context,
                                onUrlChanged = { url ->
                                    currentUrl = url
                                    canGoBack = this.canGoBack()
                                },
                                onError = { errorMessage = it },
                            )
                            webChromeClient = object : WebChromeClient() {
                                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                    progress = newProgress
                                }

                                override fun onShowCustomView(
                                    view: View?,
                                    callback: CustomViewCallback?,
                                ) {
                                    if (view == null || customView != null) {
                                        callback?.onCustomViewHidden()
                                        return
                                    }
                                    customView = view
                                    customViewCallback = callback
                                }

                                override fun onHideCustomView() {
                                    closeCustomView()
                                }
                            }
                            loadUrl(YouTubeUrlPolicy.HOME_URL)
                        }
                    },
                )
                if (downloadUrl != null) {
                    Button(
                        onClick = { onDownloadVideo(downloadUrl) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                    ) {
                        Icon(Icons.Default.Download, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text("Download this video")
                    }
                }
            }
        }

        customView?.let { videoView ->
            key(videoView) {
                AndroidView(
                    factory = { videoView },
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black),
                )
            }
        }
    }
}

private fun reelhouseWebViewClient(
    context: Context,
    onUrlChanged: (String) -> Unit,
    onError: (String) -> Unit,
) = object : WebViewClient() {
    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
    ): Boolean {
        val url = request.url.toString()
        if (YouTubeUrlPolicy.isInternalUrl(url)) return false

        if (request.url.scheme in setOf("http", "https")) {
            openExternalBrowser(context, request.url)
        }
        return true
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        onUrlChanged(url)
    }

    override fun onPageFinished(view: WebView, url: String) {
        onUrlChanged(url)
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        if (request.isForMainFrame) {
            onError("YouTube could not be loaded. Check your connection and retry.")
        }
    }
}

private fun openExternalBrowser(context: Context, uri: Uri) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    } catch (_: ActivityNotFoundException) {
        // Keep the untrusted URL out of the app WebView even when no browser exists.
    }
}
