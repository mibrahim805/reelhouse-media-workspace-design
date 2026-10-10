package com.reelhouse.downloader

import android.annotation.SuppressLint
import android.Manifest
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.app.DownloadManager
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.reelhouse.downloader.util.UrlValidator
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Android renders the production web frontend unchanged. A document-start,
 * origin-bound bridge replaces only the `/api/backend/…` fetches with the embedded
 * device backend, so media extraction and downloads never use Kubeletto.
 */
class MainActivity : ComponentActivity() {
    private lateinit var contentRoot: FrameLayout
    private lateinit var webView: WebView
    private lateinit var localBackend: LocalWebBackend
    private var nativeSplash: View? = null
    private val webBaseUrl = BuildConfig.REELHOUSE_WEB_BASE_URL.trimEnd('/')
    private val trustedOrigin = URI(webBaseUrl).let { "${it.scheme}://${it.host}" }
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var mediaPermissionRequested = false
    private var updateDownloadId: Long = -1L
    private var updateReceiver: BroadcastReceiver? = null
    private var nativeVideoOpen = false
    private var nativeVideoOpening = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val nativeStateTicker = object : Runnable {
        override fun run() {
            if (!isFinishing && !isDestroyed && ::webView.isInitialized) {
                syncNativePlaybackToWebView()
                mainHandler.postDelayed(this, 500L)
            }
        }
    }
    private var splashFallback: Runnable? = null
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(URI(webBaseUrl).host ?: "appassets.androidview.app")
            .addPathHandler("/", StaticAssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        Log.i("ReelhousePerf", "PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} phase=activity_start")
        // Use one edge-to-edge model on every supported Android version, then
        // explicitly inset normal WebView content below system bars/cutouts.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.rgb(24, 24, 28)
        window.navigationBarColor = Color.rgb(24, 24, 28)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        localBackend = LocalWebBackend(application as ReelhouseApp)
        Log.i("ReelhousePerf", "PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} phase=webview_backend_ready")
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(10, 10, 12))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                setSupportZoom(false)
                userAgentString = "$userAgentString ReelhouseAndroid/${BuildConfig.VERSION_NAME}; code=${BuildConfig.VERSION_CODE}"
            }
            // The window is hardware accelerated, but the WebView itself must
            // not be forced into one enormous layer when a library is long.
            setLayerType(View.LAYER_TYPE_NONE, null)
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            clearCache(true)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    if (fullscreenView != null) {
                        callback.onCustomViewHidden()
                        return
                    }
                    fullscreenView = view
                    fullscreenCallback = callback
                    (window.decorView as ViewGroup).addView(
                        view,
                        ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT,
                        ),
                    )
                    webView.visibility = View.GONE
                    WindowInsetsControllerCompat(window, window.decorView).apply {
                        systemBarsBehavior =
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        hide(WindowInsetsCompat.Type.systemBars())
                    }
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }

                override fun onHideCustomView() {
                    exitFullscreen()
                }
            }
            setDownloadListener { url, _, _, mimeType, _ ->
                if (url.startsWith(LOCAL_RESULT_SCHEME) || localMediaId(Uri.parse(url)) != null) {
                    showSavedMessage(Uri.parse(url))
                } else if (isAppUpdateUrl(url) || mimeType == "application/vnd.android.package-archive") {
                    downloadAndInstallUpdate(Uri.parse(url))
                } else if (url.startsWith("http://") || url.startsWith("https://")) {
                    enqueueExternalDownload(Uri.parse(url))
                }
            }
            webViewClient = ReelhouseWebViewClient()
        }
        contentRoot = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(10, 10, 12))
            addView(
                webView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            nativeSplash = layoutInflater.inflate(
                R.layout.native_splash,
                this,
                false,
            ).also { splash ->
                addView(
                    splash,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    ),
                )
            }
        }
        setContentView(contentRoot)
        applySystemThemeToWebView()
        installSafeContentInsets()

        checkBridgeSupport()
        installLocalBackendBridge()
        // The complete static export is bundled into the APK and served through
        // WebViewAssetLoader. Only the native backend bridge can do I/O.
        webView.loadUrl(initialUrl(intent))
        splashFallback = Runnable {
            if (nativeSplash != null) {
                Log.e("ReelhouseWebView", "Bundled frontend did not become visible within 4 seconds")
                dismissNativeSplash()
            }
        }.also { mainHandler.postDelayed(it, SPLASH_FALLBACK_DELAY_MS) }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (fullscreenView != null) {
                        exitFullscreen()
                    } else {
                        // Check if a web modal handles back, or if we are on the Home page ('/') where Back exits the app.
                        webView.evaluateJavascript(
                            "(() => { if (window.__reelhouseHandleBack && window.__reelhouseHandleBack()) return 'modal'; return (window.location.pathname === '/' || window.location.pathname === '') ? 'home' : 'normal'; })()",
                        ) { result ->
                            val res = result?.removeSurrounding("\"")
                            when (res) {
                                "modal" -> { /* Modal consumed the back press */ }
                                "home" -> finish()
                                else -> {
                                    if (webView.canGoBack()) webView.goBack() else finish()
                                }
                            }
                        }
                    }
                }
            },
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedText(intent)?.let { sharedUrl ->
            webView.loadUrl("$webBaseUrl/downloader?url=${Uri.encode(sharedUrl)}")
        }
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        applySystemThemeToWebView()
    }

    override fun onPause() {
        mainHandler.removeCallbacks(nativeStateTicker)
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (!::webView.isInitialized) return
        webView.onResume()
        if (nativeVideoOpen) {
            nativeVideoOpen = false
        }
        syncNativePlaybackToWebView()
        mainHandler.removeCallbacks(nativeStateTicker)
        mainHandler.post(nativeStateTicker)
    }

    private fun applySystemThemeToWebView() {
        // Reelhouse has a single dark playback theme. Keeping the system bars
        // in that palette avoids a bright flash when the phone uses light mode.
        val dark = true
        val color = Color.rgb(12, 13, 16)
        window.statusBarColor = color
        window.navigationBarColor = color
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('reelhouse-system-theme',{detail:{dark:$dark}}))", null)
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(nativeStateTicker)
        unregisterUpdateReceiver()
        exitFullscreen()
        splashFallback?.let { mainHandler.removeCallbacks(it) }
        splashFallback = null
        webView.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        super.onDestroy()
    }

    private fun checkBridgeSupport() {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "Android System WebView must be updated to run the local Reelhouse backend."
        }
        check(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            "Android System WebView must be updated to run the local Reelhouse backend."
        }
    }

    private fun installSafeContentInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot) { _, windowInsets ->
            val layout = webView.layoutParams as FrameLayout.LayoutParams
            if (fullscreenView != null) {
                layout.setMargins(0, 0, 0, 0)
                webView.layoutParams = layout
                return@setOnApplyWindowInsetsListener windowInsets
            }

            val safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout(),
            )
            val keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
            layout.setMargins(
                safe.left,
                safe.top,
                safe.right,
                maxOf(safe.bottom, keyboard.bottom),
            )
            webView.layoutParams = layout
            windowInsets
        }
        ViewCompat.requestApplyInsets(contentRoot)
    }

    private fun installLocalBackendBridge() {
        val allowedOrigins = setOf(trustedOrigin)
        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            allowedOrigins,
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != trustedOrigin) {
                return@addWebMessageListener
            }
            val requestText = message.data ?: return@addWebMessageListener
            if (openNativeVideoFromBridge(requestText)) {
                return@addWebMessageListener
            }
            maybeRequestMediaPermissions(requestText)
            Log.d("ReelhousePerf", "PERF_BUILD_ID=${BuildConfig.PERF_BUILD_ID} phase=bridge_request_received thread=${Thread.currentThread().name}")
            lifecycleScope.launch {
                val response = withContext(Dispatchers.IO) {
                    localBackend.handle(requestText)
                }
                replyProxy.postMessage(response)
            }
        }
        WebViewCompat.addDocumentStartJavaScript(
            webView,
            LOCAL_FETCH_SCRIPT,
            allowedOrigins,
        )
        WebViewCompat.addDocumentStartJavaScript(
            webView,
            ANDROID_PERFORMANCE_SCRIPT,
            allowedOrigins,
        )
        WebViewCompat.addDocumentStartJavaScript(
            webView,
            NATIVE_VIDEO_PLAYBACK_SCRIPT,
            allowedOrigins,
        )
    }

    private fun openNativeVideoFromBridge(requestText: String): Boolean {
        val request = runCatching { JSONObject(requestText) }.getOrNull() ?: return false
        val type = request.optString("type")
        if (type == NATIVE_COMMAND_MESSAGE) return handleNativePlayerCommand(request)
        if (type != NATIVE_VIDEO_MESSAGE && type != NATIVE_ONLINE_MESSAGE) return false

        val source = request.optString("url").takeIf(String::isNotBlank) ?: return true
        val positionMs = (request.optDouble("position", 0.0) * 1_000.0)
            .toLong()
            .coerceAtLeast(0L)
        if (type == NATIVE_ONLINE_MESSAGE) {
            if (PlaybackRequestValidator.onlineSource(source) == null) {
                Toast.makeText(this, "This online video URL is not valid.", Toast.LENGTH_LONG).show()
                return true
            }
            if (nativeVideoOpen) return true
            nativeVideoOpen = true
            startActivity(
                Intent(this@MainActivity, NativeVideoPlayerActivity::class.java)
                    .putExtra(NativeVideoPlayerActivity.EXTRA_SOURCE_URL, source)
                    .putExtra(NativeVideoPlayerActivity.EXTRA_TITLE, request.optString("title", "Online video"))
                    .putExtra(NativeVideoPlayerActivity.EXTRA_THUMBNAIL, request.optString("thumbnail"))
                    .putExtra(
                        NativeVideoPlayerActivity.EXTRA_MEDIA_KEY,
                        PlaybackRequestValidator.key(request.optString("key")) ?: "youtube:${source.hashCode()}",
                    )
                    .putExtra(NativeVideoPlayerActivity.EXTRA_POSITION_MS, positionMs),
            )
            return true
        }
        if (nativeVideoOpen || nativeVideoOpening) return true
        nativeVideoOpening = true
        lifecycleScope.launch {
            val media = withContext(Dispatchers.IO) { resolveNativeVideo(source) }
            if (media == null) {
                nativeVideoOpening = false
                Toast.makeText(
                    this@MainActivity,
                    "This offline video is no longer available.",
                    Toast.LENGTH_LONG,
                ).show()
                return@launch
            }
            if (nativeVideoOpen) {
                nativeVideoOpening = false
                return@launch
            }
            nativeVideoOpening = false
            nativeVideoOpen = true
            startActivity(
                Intent(this@MainActivity, NativeVideoPlayerActivity::class.java)
                    .putExtra(NativeVideoPlayerActivity.EXTRA_URI, media.first.toString())
                    .putExtra(NativeVideoPlayerActivity.EXTRA_TITLE, media.second)
                    .putExtra(NativeVideoPlayerActivity.EXTRA_MEDIA_KEY, localPlaybackKey(source))
                    .putExtra(NativeVideoPlayerActivity.EXTRA_POSITION_MS, positionMs),
            )
        }
        return true
    }

    private fun handleNativePlayerCommand(request: JSONObject): Boolean {
        val command = request.optString("command")
        val controller = (application as ReelhouseApp).nativePlayback
        when (command) {
            "play" -> controller.player.play()
            "pause" -> controller.player.pause()
            "seek" -> {
                val deltaMs = (request.optDouble("seconds", 0.0) * 1_000.0).toLong()
                val target = (controller.player.currentPosition + deltaMs).coerceAtLeast(0L)
                controller.player.seekTo(target)
            }
            "speed" -> controller.player.setPlaybackSpeed(request.optDouble("value", 1.0).toFloat().coerceIn(0.25f, 2f))
            "close" -> controller.stop()
            "restore" -> {
                val session = controller.session
                if (session != null && !nativeVideoOpen) {
                    nativeVideoOpen = true
                    startActivity(
                        Intent(this, NativeVideoPlayerActivity::class.java)
                            .putExtra(NativeVideoPlayerActivity.EXTRA_URI, if (session.online) null else session.uri.toString())
                            .putExtra(NativeVideoPlayerActivity.EXTRA_SOURCE_URL, session.sourceUrl)
                            .putExtra(NativeVideoPlayerActivity.EXTRA_TITLE, session.title)
                            .putExtra(NativeVideoPlayerActivity.EXTRA_THUMBNAIL, session.thumbnail)
                            .putExtra(NativeVideoPlayerActivity.EXTRA_MEDIA_KEY, session.key)
                            .putExtra(NativeVideoPlayerActivity.EXTRA_POSITION_MS, controller.player.currentPosition),
                    )
                }
            }
            "state" -> Unit
            else -> return true
        }
        syncNativePlaybackToWebView()
        return true
    }

    private fun localPlaybackKey(source: String): String {
        val uri = Uri.parse(source)
        deviceMediaRef(uri)?.let { return "local-video:device-${it.collection}-${it.id}" }
        localMediaId(uri)?.let { return "local-video:$it" }
        return "local-video:${source.hashCode()}"
    }

    private fun syncNativePlaybackToWebView() {
        if (!::webView.isInitialized) return
        val snapshot = (application as ReelhouseApp).nativePlayback.snapshot()
        val detail = JSONObject().apply {
            put("active", snapshot.active)
            put("key", snapshot.key)
            put("title", snapshot.title)
            put("thumbnail", snapshot.thumbnail)
            put("online", snapshot.online)
            put("playing", snapshot.playing)
            put("position", snapshot.positionMs / 1_000.0)
            put("duration", snapshot.durationMs / 1_000.0)
            put("speed", snapshot.speed)
            put("ended", snapshot.ended)
            put("buffering", snapshot.buffering)
            put("error", snapshot.error)
            put("uiOpen", nativeVideoOpen)
        }
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('reelhouse-native-player-state',{detail:${detail}}))",
            null,
        )
    }

    private fun resolveNativeVideo(source: String): Pair<Uri, String>? {
        val sourceUri = runCatching { Uri.parse(source) }.getOrNull() ?: return null
        deviceMediaRef(sourceUri)?.let { ref ->
            if (ref.collection != "video") return null
            val contentUri = ContentUris.withAppendedId(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                ref.id,
            )
            val title = contentResolver.query(
                contentUri,
                arrayOf(MediaStore.Video.Media.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            } ?: "Offline video"
            return contentUri to title
        }

        val id = localMediaId(sourceUri) ?: return null
        val item = runBlocking(Dispatchers.IO) {
            (application as ReelhouseApp).database.downloadDao().getById(id)
        } ?: return null
        val contentUri = item.contentUri?.let(Uri::parse) ?: return null
        val title = item.savedDisplayName.takeIf(String::isNotBlank)
            ?: item.title.takeIf(String::isNotBlank)
            ?: "Offline video"
        return contentUri to title
    }

    private fun maybeRequestMediaPermissions(requestText: String) {
        if (!requestText.contains("/api/backend/local-media") || mediaPermissionRequested || hasMediaPermissions()) return
        mediaPermissionRequested = true
        runOnUiThread { requestPermissions(requiredMediaPermissions(), MEDIA_PERMISSION_REQUEST) }
    }

    private fun requiredMediaPermissions(): Array<String> = if (Build.VERSION.SDK_INT >= 33) {
        arrayOf(Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO)
    } else {
        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    private fun hasMediaPermissions() = requiredMediaPermissions().all {
        androidx.core.content.ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == MEDIA_PERMISSION_REQUEST) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('reelhouse-media-permission'))", null)
        }
    }

    private fun initialUrl(intent: Intent?): String =
        sharedText(intent)?.let { "$webBaseUrl/downloader?url=${Uri.encode(it)}" }
            ?: webBaseUrl

    private fun sharedText(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
            intent.getCharSequenceExtra(Intent.EXTRA_TEXT)
                ?.toString()
                ?.let(UrlValidator::extractHttpUrl)
        } else {
            null
        }

    private inner class ReelhouseWebViewClient : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            // Do not keep the native overlay above a failed/slow document. The
            // WebView background or its error page is more useful than a stuck
            // splash image while the bundled page is being diagnosed.
            dismissNativeSplash()
            super.onPageStarted(view, url, favicon)
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            dismissNativeSplash()
            applySystemThemeToWebView()
            super.onPageCommitVisible(view, url)
        }

        override fun onReceivedError(
            view: WebView,
            request: android.webkit.WebResourceRequest,
            error: android.webkit.WebResourceError,
        ) {
            if (request.isForMainFrame) {
                dismissNativeSplash()
                Log.e("ReelhouseWebView", "Bundled frontend failed: ${error.description}")
            }
            super.onReceivedError(view, request, error)
        }

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean {
            val uri = request.url
            if (uri.scheme == LOCAL_RESULT_SCHEME) {
                showSavedMessage(uri)
                return true
            }
            if (!request.isForMainFrame) return false
            if (uri.scheme == "https" && uri.host == URI(webBaseUrl).host) {
                // Intercept the APK download URL so the WebView doesn't try to
                // render the binary response — let the DownloadListener handle it.
                if (uri.path.orEmpty().startsWith("/api/app-download/android")) {
                    downloadAndInstallUpdate(uri)
                    return true
                }
                return false
            }
            if (uri.scheme == "https" && uri.host.isYoutubeHost()) return false

            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            return true
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? {
            val uri = request.url
            if (deviceMediaRef(uri) != null) {
                return deviceMediaResponse(uri, request.requestHeaders.entries.firstOrNull { it.key.equals("Range", ignoreCase = true) }?.value)
            }
            if (localMediaId(uri) != null) {
                val range = request.requestHeaders.entries
                    .firstOrNull { it.key.equals("Range", ignoreCase = true) }
                    ?.value
                return localMediaResponse(uri, range)
            }
            if (
                uri.scheme == "https" &&
                uri.host == URI(webBaseUrl).host &&
                uri.path.orEmpty().startsWith("/api/backend/") &&
                !uri.path.orEmpty().startsWith("/api/backend/account/")
            ) {
                val body = """{"ok":false,"error":"Android local backend bridge was not ready."}"""
                return WebResourceResponse(
                    "application/json",
                    "UTF-8",
                    503,
                    "Local backend unavailable",
                    mapOf("Cache-Control" to "no-store"),
                    ByteArrayInputStream(body.encodeToByteArray()),
                )
            }
            assetLoader.shouldInterceptRequest(uri)?.let { return it }
            return null
        }
    }

    private fun dismissNativeSplash() {
        nativeSplash?.let { splash ->
            (splash.parent as? ViewGroup)?.removeView(splash)
            nativeSplash = null
        }
    }

    private fun String?.isYoutubeHost(): Boolean {
        val host = this?.lowercase() ?: return false
        return host == "youtube.com" || host.endsWith(".youtube.com") ||
            host == "youtu.be" || host.endsWith(".youtu.be")
    }

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        webView.visibility = View.VISIBLE
        WindowInsetsControllerCompat(window, window.decorView)
            .show(WindowInsetsCompat.Type.systemBars())
        ViewCompat.requestApplyInsets(contentRoot)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }

    private fun showSavedMessage(uri: Uri) {
        val id = localMediaId(uri) ?: uri.host ?: uri.lastPathSegment.orEmpty()
        lifecycleScope.launch {
            val item = withContext(Dispatchers.IO) {
                (application as ReelhouseApp).database.downloadDao().getById(id)
            }
            val location = item?.savedLocation?.takeIf(String::isNotBlank)
                ?: "Downloads/Reelhouse"
            Toast.makeText(
                this@MainActivity,
                "Already saved to $location",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun localMediaId(uri: Uri): String? {
        if (uri.scheme == LOCAL_RESULT_SCHEME) {
            return (uri.host ?: uri.lastPathSegment)?.takeIf(String::isNotBlank)
        }
        if (uri.scheme != "https" || uri.host != URI(webBaseUrl).host) return null
        val prefix = "/api/backend/android-media/"
        return uri.path.orEmpty()
            .takeIf { it.startsWith(prefix) }
            ?.removePrefix(prefix)
            ?.substringBefore('/')
            ?.takeIf(String::isNotBlank)
    }

    private data class DeviceMediaRef(val collection: String, val id: Long)

    private fun deviceMediaRef(uri: Uri): DeviceMediaRef? {
        if (uri.scheme != "https" || uri.host != URI(webBaseUrl).host) return null
        val parts = uri.path.orEmpty().removePrefix("/api/backend/android-device-media/").split('/')
        if (parts.size != 2 || parts[0] !in setOf("video", "audio")) return null
        return parts[1].toLongOrNull()?.let { DeviceMediaRef(parts[0], it) }
    }

    private fun deviceMediaResponse(uri: Uri, rangeHeader: String?): WebResourceResponse {
        val ref = deviceMediaRef(uri) ?: return localMediaError(404, "Not found")
        val collection = if (ref.collection == "audio") MediaStore.Audio.Media.EXTERNAL_CONTENT_URI else MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        val contentUri = ContentUris.withAppendedId(collection, ref.id)
        val descriptor = contentResolver.openAssetFileDescriptor(contentUri, "r") ?: return localMediaError(404, "Not found")
        val total = descriptor.length.takeIf { it > 0L } ?: return localMediaError(416, "Range not satisfiable")
        val requestedRange = parseByteRange(rangeHeader, total)
        if (rangeHeader != null && requestedRange == null) {
            descriptor.close()
            return localMediaError(416, "Range not satisfiable", mapOf("Content-Range" to "bytes */$total"))
        }
        val start = requestedRange?.first ?: 0L
        val end = requestedRange?.last ?: total - 1L
        val input = descriptor.createInputStream()
        skipFully(input, start)
        val length = end - start + 1L
        val headers = linkedMapOf("Accept-Ranges" to "bytes", "Content-Length" to length.toString(), "Cache-Control" to "no-store")
        if (requestedRange != null) headers["Content-Range"] = "bytes $start-$end/$total"
        return WebResourceResponse(contentResolver.getType(contentUri) ?: if (ref.collection == "audio") "audio/mpeg" else "video/mp4", null, if (requestedRange == null) 200 else 206, if (requestedRange == null) "OK" else "Partial Content", headers, LimitedInputStream(input, length))
    }

    private fun localMediaResponse(uri: Uri, rangeHeader: String?): WebResourceResponse {
        val id = localMediaId(uri)
            ?: return localMediaError(404, "Not found")
        val item = runBlocking(Dispatchers.IO) {
            (application as ReelhouseApp).database.downloadDao().getById(id)
        } ?: return localMediaError(404, "Not found")
        val contentUri = item.contentUri?.let(Uri::parse)
            ?: return localMediaError(404, "Not found")
        val descriptor = contentResolver.openAssetFileDescriptor(contentUri, "r")
            ?: return localMediaError(404, "Not found")
        val total = item.fileSizeBytes.takeIf { it > 0L }
            ?: descriptor.length.takeIf { it > 0L }
            ?: return localMediaError(416, "Range not satisfiable")
        val requestedRange = parseByteRange(rangeHeader, total)
        if (rangeHeader != null && requestedRange == null) {
            descriptor.close()
            return localMediaError(
                416,
                "Range not satisfiable",
                mapOf("Content-Range" to "bytes */$total"),
            )
        }
        val start = requestedRange?.first ?: 0L
        val end = requestedRange?.last ?: total - 1L
        val input = descriptor.createInputStream()
        skipFully(input, start)
        val length = end - start + 1L
        val headers = linkedMapOf(
            "Accept-Ranges" to "bytes",
            "Content-Length" to length.toString(),
            "Cache-Control" to "no-store",
        )
        if (requestedRange != null) headers["Content-Range"] = "bytes $start-$end/$total"
        return WebResourceResponse(
            item.mimeType.ifBlank { "application/octet-stream" },
            null,
            if (requestedRange == null) 200 else 206,
            if (requestedRange == null) "OK" else "Partial Content",
            headers,
            LimitedInputStream(input, length),
        )
    }

    private fun parseByteRange(value: String?, total: Long): LongRange? {
        if (value == null) return null
        val match = RANGE_PATTERN.matchEntire(value.trim()) ?: return null
        val startValue = match.groupValues[1].toLongOrNull()
        val endValue = match.groupValues[2].toLongOrNull()
        if (startValue == null) {
            val suffixLength = endValue ?: return null
            if (suffixLength <= 0L) return null
            val start = (total - suffixLength).coerceAtLeast(0L)
            return start..(total - 1L)
        }
        val start = startValue
        val requestedEnd = endValue ?: (total - 1L)
        if (start < 0L || start >= total || requestedEnd < start) return null
        return start..requestedEnd.coerceAtMost(total - 1L)
    }

    private fun skipFully(input: InputStream, bytes: Long) {
        var remaining = bytes
        while (remaining > 0L) {
            val skipped = input.skip(remaining)
            if (skipped > 0L) {
                remaining -= skipped
            } else if (input.read() == -1) {
                break
            } else {
                remaining--
            }
        }
    }

    private fun localMediaError(
        status: Int,
        reason: String,
        headers: Map<String, String> = emptyMap(),
    ) = WebResourceResponse(
        "text/plain",
        "UTF-8",
        status,
        reason,
        headers,
        ByteArrayInputStream(reason.encodeToByteArray()),
    )

    private class LimitedInputStream(
        input: InputStream,
        private var remaining: Long,
    ) : FilterInputStream(input) {
        override fun read(): Int {
            if (remaining <= 0L) return -1
            val value = super.read()
            if (value >= 0) remaining--
            return value
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (remaining <= 0L) return -1
            val count = super.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
            if (count > 0) remaining -= count
            return count
        }
    }

    // ── App self-update: download APK and launch the installer ──────────

    private fun isAppUpdateUrl(url: String): Boolean {
        val parsed = runCatching { URI(url) }.getOrNull() ?: return false
        val webHost = URI(webBaseUrl).host
        return parsed.host == webHost && parsed.path.orEmpty().startsWith("/api/app-download/android")
    }

    private fun downloadAndInstallUpdate(uri: Uri) {
        // On Android 8+ we need the INSTALL_PACKAGES permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            // Ask the user to enable "Install unknown apps" for this app
            runCatching {
                startActivity(Intent(
                    android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName"),
                ))
            }
            Toast.makeText(this, "Please allow app installs, then try updating again.", Toast.LENGTH_LONG).show()
            return
        }

        val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        val apkName = "Reelhouse-update-${System.currentTimeMillis()}.apk"
        val request = DownloadManager.Request(uri)
            .setTitle("Reelhouse Update")
            .setDescription("Downloading new version…")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, apkName)
            .setMimeType("application/vnd.android.package-archive")

        updateDownloadId = dm.enqueue(request)
        Toast.makeText(this, "Downloading update…", Toast.LENGTH_SHORT).show()

        // Notify the WebView JS that the download started
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('reelhouse-update-download',{detail:{status:'downloading'}}))",
            null,
        )

        // Register a one-shot receiver to install the APK when download completes
        unregisterUpdateReceiver()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                if (downloadId != updateDownloadId) return
                unregisterUpdateReceiver()
                installDownloadedApk(dm, downloadId)
            }
        }
        updateReceiver = receiver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        }
    }

    private fun installDownloadedApk(dm: DownloadManager, downloadId: Long) {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor = dm.query(query)
        if (cursor == null || !cursor.moveToFirst()) {
            cursor?.close()
            Toast.makeText(this, "Update download failed.", Toast.LENGTH_LONG).show()
            notifyWebViewUpdateStatus("failed")
            return
        }

        val statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val status = if (statusColumn >= 0) cursor.getInt(statusColumn) else -1
        if (status != DownloadManager.STATUS_SUCCESSFUL) {
            cursor.close()
            Toast.makeText(this, "Update download failed.", Toast.LENGTH_LONG).show()
            notifyWebViewUpdateStatus("failed")
            return
        }

        val localUriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
        val localUriString = if (localUriColumn >= 0) cursor.getString(localUriColumn) else null
        cursor.close()

        if (localUriString == null) {
            Toast.makeText(this, "Update file not found.", Toast.LENGTH_LONG).show()
            notifyWebViewUpdateStatus("failed")
            return
        }

        val localUri = Uri.parse(localUriString)
        val file = when (localUri.scheme) {
            "file" -> File(localUri.path!!)
            "content" -> {
                // On newer Android, DownloadManager may return a content URI.
                // Use the dm.openDownloadedFile or derive the file path.
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val nameColumn = dm.query(DownloadManager.Query().setFilterById(downloadId))?.use { c ->
                    if (c.moveToFirst()) {
                        val idx = c.getColumnIndex(DownloadManager.COLUMN_LOCAL_FILENAME)
                        if (idx >= 0) c.getString(idx) else null
                    } else null
                }
                if (nameColumn != null) File(nameColumn) else File(downloadsDir, "Reelhouse-update.apk")
            }
            else -> {
                Toast.makeText(this, "Could not locate update file.", Toast.LENGTH_LONG).show()
                notifyWebViewUpdateStatus("failed")
                return
            }
        }

        if (!file.exists()) {
            Toast.makeText(this, "Update file not found on disk.", Toast.LENGTH_LONG).show()
            notifyWebViewUpdateStatus("failed")
            return
        }

        val installUri = androidx.core.content.FileProvider.getUriForFile(
            this,
            "$packageName.files",
            file,
        )

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(installUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        notifyWebViewUpdateStatus("installing")
        runCatching { startActivity(installIntent) }.onFailure {
            Toast.makeText(this, "Could not open the installer.", Toast.LENGTH_LONG).show()
            notifyWebViewUpdateStatus("failed")
        }
    }

    private fun notifyWebViewUpdateStatus(status: String) {
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('reelhouse-update-download',{detail:{status:'$status'}}))",
            null,
        )
    }

    private fun unregisterUpdateReceiver() {
        updateReceiver?.let {
            runCatching { unregisterReceiver(it) }
            updateReceiver = null
        }
    }

    private fun enqueueExternalDownload(uri: Uri) {
        val name = uri.lastPathSegment?.substringAfterLast('/')
            ?.takeIf { it.isNotBlank() && it.length <= 120 }
            ?: "reelhouse-video.mp4"
        val request = DownloadManager.Request(uri)
            .setTitle(name)
            .setDescription("${getString(R.string.app_name)} download")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "Reelhouse/$name",
            )
        (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        Toast.makeText(this, "Download saved to Downloads/Reelhouse", Toast.LENGTH_LONG).show()
    }

    companion object {
        private const val BRIDGE_NAME = "ReelhouseAndroid"
        private const val NATIVE_VIDEO_MESSAGE = "native-video-playback"
        private const val NATIVE_ONLINE_MESSAGE = "native-online-playback"
        private const val NATIVE_COMMAND_MESSAGE = "native-player-command"
        private const val LOCAL_RESULT_SCHEME = "reelhouse-local"
        private const val MEDIA_PERMISSION_REQUEST = 7001
        private const val SPLASH_FALLBACK_DELAY_MS = 4_000L
        private val RANGE_PATTERN = Regex("bytes=(\\d+)-(\\d*)", RegexOption.IGNORE_CASE)

        /**
         * Chromium on some Android devices aborts otherwise valid offline
         * MP4 files after a few seconds with an audio MediaCodec error. Route
         * only local video play commands to Android's native media stack.
         */
        private val NATIVE_VIDEO_PLAYBACK_SCRIPT = """
            (() => {
              if (window.__reelhouseNativeVideoInstalled) return;
              window.__reelhouseNativeVideoInstalled = true;
              const webPlay = HTMLMediaElement.prototype.play;

              HTMLMediaElement.prototype.play = function(...args) {
                try {
                  const source = this.currentSrc || this.getAttribute('src') || '';
                  const url = new URL(source, location.href);
                  const localVideo = this instanceof HTMLVideoElement &&
                    url.origin === location.origin &&
                    (url.pathname.startsWith('/api/backend/android-device-media/video/') ||
                     url.pathname.startsWith('/api/backend/android-media/'));
                  if (localVideo) {
                    ReelhouseAndroid.postMessage(JSON.stringify({
                      type: 'native-video-playback',
                      url: url.href,
                      position: Number.isFinite(this.currentTime) ? this.currentTime : 0
                    }));
                    return Promise.resolve();
                  }
                } catch (_) {}
                return webPlay.apply(this, args);
              };
            })();
        """.trimIndent()

        /**
         * The mobile stylesheet already avoids most expensive effects, but
         * this document-start rule also covers tablet-sized Android windows
         * and keeps route transitions from waiting on decorative animations.
         */
        private val ANDROID_PERFORMANCE_SCRIPT = """
            (() => {
              if (window.__reelhouseAndroidPerformanceInstalled) return;
              window.__reelhouseAndroidPerformanceInstalled = true;

              // Keep route transitions uncovered so fixed glass navigation stays
              // stable while Next swaps the page content underneath it.

              const install = () => {
                const root = document.documentElement;
                if (!root || root.classList.contains('reelhouse-android')) return;
                root.classList.add('reelhouse-android');
                // The Android shell is intentionally dark and lightweight;
                // keep the web theme from switching to the light palette when
                // the phone itself is using a light system theme.
                const forceDark = () => {
                  if (root.classList.contains('light')) root.classList.remove('light');
                  if (!root.classList.contains('dark')) root.classList.add('dark');
                  root.style.colorScheme = 'dark';
                };
                forceDark();
                new MutationObserver(forceDark).observe(root, { attributes: true, attributeFilter: ['class'] });
                const style = document.createElement('style');
                style.textContent = `
                  html.reelhouse-android,
                  html.reelhouse-android body {
                    scroll-behavior: auto !important;
                    background: #0b0813 !important;
                  }
                  @keyframes reelhouse-android-page-enter {
                    from {
                      opacity: 0;
                      transform: translate3d(0, 12px, 0) scale(0.992);
                    }
                    to {
                      opacity: 1;
                      transform: translate3d(0, 0, 0) scale(1);
                    }
                  }
                  html.reelhouse-android .page-transition {
                    animation: reelhouse-android-page-enter 260ms cubic-bezier(.22, 1, .36, 1) both !important;
                    transform-origin: center top !important;
                    will-change: opacity, transform !important;
                  }
                  html.reelhouse-android .stagger-children > * {
                    animation-delay: 0ms !important;
                    animation-duration: 120ms !important;
                  }
                  html.reelhouse-android .navigation-progress,
                  html.reelhouse-android .loading-shimmer {
                    animation: none !important;
                  }
                  /* Remove decorative 3D/background artwork on Android. */
                  html.reelhouse-android .shell-background-art,
                  html.reelhouse-android .home-glow,
                  html.reelhouse-android .water-bubble,
                  html.reelhouse-android [class*="music-droplet"] {
                    display: none !important;
                  }
                  html.reelhouse-android .home-glow,
                  html.reelhouse-android .water-bubble,
                  html.reelhouse-android .sliding-liquid-bubble,
                  html.reelhouse-android [class*="music-droplet"] {
                    animation: none !important;
                  }
                  html.reelhouse-android [class*="backdrop-blur"] {
                    -webkit-backdrop-filter: none !important;
                    backdrop-filter: none !important;
                  }
                  html.reelhouse-android .liquid-glass-card,
                  html.reelhouse-android .liquid-glass-input,
                  html.reelhouse-android .liquid-glass-pill {
                    -webkit-backdrop-filter: none !important;
                    backdrop-filter: none !important;
                  }
                  html.reelhouse-android .card-3d-effect {
                    transform-style: flat !important;
                    will-change: auto !important;
                    transition: border-color 100ms ease-out !important;
                  }
                  html.reelhouse-android .card-3d-effect:hover,
                  html.reelhouse-android .card-3d-effect:active {
                    transform: none !important;
                  }
                  html.reelhouse-android [class*="transition-all"],
                  html.reelhouse-android [class*="duration-300"],
                  html.reelhouse-android [class*="duration-500"],
                  html.reelhouse-android [class*="duration-700"] {
                    transition-duration: 100ms !important;
                  }
                  html.reelhouse-android [class*="drop-shadow"] {
                    filter: none !important;
                  }
                  html.reelhouse-android .bubble-active-icon {
                    animation: none !important;
                  }
                  html.reelhouse-android .sliding-liquid-bubble {
                    animation: none !important;
                    transition: transform 100ms ease-out !important;
                    background: linear-gradient(135deg, #ec4899, #c026d3) !important;
                    border: 0 !important;
                    -webkit-backdrop-filter: none !important;
                    backdrop-filter: none !important;
                    box-shadow: none !important;
                  }
                  html.reelhouse-android .sliding-liquid-bubble::before,
                  html.reelhouse-android .sliding-liquid-bubble::after {
                    display: none !important;
                  }
                  /* A clean, flat Android home layout: keep the artwork and
                     content, remove only the expensive 3D/glass treatment. */
                  html.reelhouse-android .home-screen {
                    background: linear-gradient(180deg, #100c19 0%, #0b0813 55%, #09070f 100%) !important;
                    overflow-x: hidden !important;
                    overflow-y: visible !important;
                  }
                  html.reelhouse-android .home-screen > svg {
                    display: none !important;
                  }
                  html.reelhouse-android .home-screen > header > button[aria-label="User Profile"],
                  html.reelhouse-android .home-screen > div.fixed:has(input[placeholder="e.g. Ibrahim"]) {
                    display: none !important;
                  }
                  html.reelhouse-android .home-screen > header {
                    justify-content: flex-end !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type {
                    margin-top: 20px !important;
                  }
                  html.reelhouse-android .home-screen .home-card {
                    border: 1px solid rgba(255, 255, 255, 0.10) !important;
                    border-radius: 22px !important;
                    background: #171321 !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28) !important;
                    transform-style: flat !important;
                    will-change: auto !important;
                  }
                  html.reelhouse-android .home-screen .home-card:hover,
                  html.reelhouse-android .home-screen .home-card:active {
                    transform: none !important;
                  }
                  html.reelhouse-android .home-screen .home-card-image {
                    transition: none !important;
                    transform: none !important;
                  }
                  /* The Android app stays dark even when the device theme is
                     light; keep Home text and controls readable. */
                  html.reelhouse-android .home-screen [class~="text-white"],
                  html.reelhouse-android .home-screen [class*="text-white/"] {
                    color: #ffffff !important;
                  }
                  html.reelhouse-android .home-screen .liquid-glass-pill {
                    color: rgba(255, 255, 255, 0.88) !important;
                    background: #171321 !important;
                  }
                  html.reelhouse-android .home-screen section {
                    margin-bottom: 28px !important;
                  }
                  html.reelhouse-android .home-screen section:has(h2) > div:first-child {
                    align-items: center !important;
                  }
                  html.reelhouse-android .home-screen section:has(h2) > div:first-child h2 {
                    color: #ffffff !important;
                    font-size: 18px !important;
                  }
                  /* Placeholder artwork is a utility asset, not a useful
                     Home thumbnail. Let the card's dark gradient show. */
                  html.reelhouse-android .home-screen .home-card img[src*="placeholder.svg"] {
                    display: none !important;
                  }
                  html.reelhouse-android .home-screen .home-card:has(img[src*="placeholder.svg"]) {
                    background: linear-gradient(145deg, #21172d 0%, #15111e 100%) !important;
                  }
                  html.reelhouse-android .home-screen .home-card > .bg-gradient-to-t {
                    opacity: 0.88 !important;
                  }
                  html.reelhouse-android .home-screen .home-card h3 {
                    color: #ffffff !important;
                    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65) !important;
                  }
                  html.reelhouse-android .home-screen .home-card p {
                    color: rgba(255, 255, 255, 0.72) !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"] {
                    background: #171321 !important;
                    border-color: rgba(217, 70, 239, 0.35) !important;
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42) !important;
                    color: #ffffff !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"] [class~="text-white"],
                  html.reelhouse-android aside[aria-label="Mini player"] [class*="text-white/"] {
                    color: #ffffff !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"] img[src*="placeholder.svg"] {
                    display: none !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"]:has(> div:first-child video) > div:first-child {
                    position: relative !important;
                    background: linear-gradient(145deg, #54216f 0%, #d946ef 100%) !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"]:has(> div:first-child video) > div:first-child video {
                    opacity: 0 !important;
                  }
                  html.reelhouse-android aside[aria-label="Mini player"]:has(> div:first-child video) > div:first-child::after {
                    content: '▶';
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ffffff;
                    font-size: 22px;
                    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
                  }
                  html.reelhouse-android aside[aria-label="Mini player"] button {
                    background: #241a32 !important;
                    border-color: rgba(255, 255, 255, 0.14) !important;
                  }
                  html.reelhouse-android .home-screen .translate-z-10,
                  html.reelhouse-android .home-screen .translate-z-20,
                  html.reelhouse-android .home-screen .translate-z-30 {
                    transform: none !important;
                  }
                  html.reelhouse-android .home-screen .liquid-glass-card,
                  html.reelhouse-android .home-screen .liquid-glass-input,
                  html.reelhouse-android .home-screen .liquid-glass-pill {
                    background: rgba(24, 18, 36, 0.96) !important;
                    border-color: rgba(255, 255, 255, 0.10) !important;
                    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22) !important;
                    -webkit-backdrop-filter: none !important;
                    backdrop-filter: none !important;
                  }
                  html.reelhouse-android .home-screen .liquid-glow-btn {
                    background: #d946ef !important;
                    box-shadow: 0 5px 14px rgba(217, 70, 239, 0.28) !important;
                  }
                  html.reelhouse-android .home-screen .animate-pulse {
                    animation: none !important;
                  }
                  /* Keep Home compact even when the device library contains
                     hundreds of items. The complete list remains in Library. */
                  html.reelhouse-android .home-screen section:has(h2) .grid > a:nth-child(n+5) {
                    display: none !important;
                  }
                  /* Compact Android visual system. The app uses solid layers
                     so scrolling does not continuously repaint glass blurs. */
                  html.reelhouse-android,
                  html.reelhouse-android body,
                  html.reelhouse-android body > div,
                  html.reelhouse-android .home-screen {
                    background: #0c0d10 !important;
                  }
                  html.reelhouse-android .home-screen {
                    padding: 18px 14px 150px !important;
                  }
                  html.reelhouse-android .home-header {
                    align-items: center !important;
                    justify-content: space-between !important;
                  }
                  html.reelhouse-android .home-heading p {
                    color: #ff5368 !important;
                  }
                  html.reelhouse-android .home-heading h1 {
                    color: #f7f7f8 !important;
                    font-size: 21px !important;
                    line-height: 1.2 !important;
                  }
                  html.reelhouse-android .home-header .liquid-glass-pill {
                    width: 40px !important;
                    height: 40px !important;
                    background: #18191e !important;
                    border: 1px solid #282a31 !important;
                    box-shadow: none !important;
                  }
                  html.reelhouse-android .home-header > div:last-child {
                    gap: 8px !important;
                  }
                  html.reelhouse-android .home-section-heading {
                    display: block !important;
                  }
                  html.reelhouse-android .home-section-heading h2 {
                    color: #f7f7f8 !important;
                    font-size: 19px !important;
                  }
                  html.reelhouse-android .home-section-heading p {
                    color: #858791 !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type {
                    margin-top: 24px !important;
                    margin-bottom: 30px !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type > .grid > div {
                    display: contents !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type > .grid {
                    gap: 10px !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card {
                    aspect-ratio: 16 / 11 !important;
                    border-radius: 16px !important;
                  }
                  html.reelhouse-android .home-screen .home-card {
                    background: #17181d !important;
                    border-color: #282a31 !important;
                    box-shadow: none !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card h2 {
                    font-size: 14px !important;
                    line-height: 1.15 !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card p {
                    font-size: 10px !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card .liquid-glow-btn {
                    width: 38px !important;
                    height: 38px !important;
                    background: rgba(255, 255, 255, 0.94) !important;
                    color: #111217 !important;
                    box-shadow: none !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card .liquid-glow-btn svg {
                    width: 17px !important;
                    height: 17px !important;
                    color: #111217 !important;
                    fill: #111217 !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card > div[class*="left-3"][class*="top-3"] {
                    max-width: calc(100% - 54px) !important;
                    padding: 4px 8px !important;
                    border: 0 !important;
                    font-size: 9px !important;
                    background: rgba(12, 13, 16, 0.78) !important;
                  }
                  html.reelhouse-android .home-screen > section:first-of-type .home-card > button {
                    top: 8px !important;
                    right: 8px !important;
                    width: 32px !important;
                    height: 32px !important;
                    border: 0 !important;
                    background: rgba(12, 13, 16, 0.78) !important;
                  }
                  html.reelhouse-android .home-downloaded-section {
                    margin-top: 0 !important;
                  }
                  html.reelhouse-android .home-downloaded-section > div:first-child h2 svg,
                  html.reelhouse-android .home-downloaded-section > div:first-child a {
                    color: #ff5368 !important;
                  }
                  html.reelhouse-android .home-downloaded-section .grid {
                    gap: 10px !important;
                  }
                  html.reelhouse-android .home-downloaded-section .home-card {
                    border-radius: 14px !important;
                    background: linear-gradient(145deg, #202127 0%, #131419 100%) !important;
                  }
                  html.reelhouse-android .home-downloaded-section .home-download-fallback {
                    color: #565963 !important;
                  }
                  html.reelhouse-android .home-downloaded-section .grid > a:nth-child(n+3) {
                    display: none !important;
                  }
                  html.reelhouse-android .app-bottom-nav {
                    bottom: 8px !important;
                    width: calc(100% - 24px) !important;
                    max-width: 430px !important;
                    height: 62px !important;
                    padding: 5px 6px !important;
                    gap: 0 !important;
                    justify-content: space-around !important;
                    border-radius: 18px !important;
                    border: 1px solid #2a2b31 !important;
                    background: #15161a !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34) !important;
                  }
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble {
                    display: none !important;
                  }
                  html.reelhouse-android .app-bottom-nav-item {
                    width: 25% !important;
                    flex: 1 1 0 !important;
                    height: 50px !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 3px !important;
                    border-radius: 12px !important;
                    color: #81838c !important;
                  }
                  html.reelhouse-android .app-bottom-nav-item[aria-current="page"] {
                    color: #ff5368 !important;
                    background: #242126 !important;
                  }
                  html.reelhouse-android .app-bottom-nav-item svg {
                    width: 19px !important;
                    height: 19px !important;
                    transform: none !important;
                  }
                  html.reelhouse-android .app-bottom-nav-item .android-nav-label {
                    display: block !important;
                    font-size: 9px !important;
                    font-weight: 600 !important;
                    line-height: 1 !important;
                  }
                  /* The home route uses the reflective liquid-glass navigation surface. */
                  html.reelhouse-android .home-liquid-nav {
                    border: 1px solid rgba(255, 255, 255, 0.24) !important;
                    background:
                      linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.045) 48%, rgba(255, 255, 255, 0.1)),
                      rgba(16, 12, 27, 0.72) !important;
                    -webkit-backdrop-filter: blur(26px) saturate(185%) !important;
                    backdrop-filter: blur(26px) saturate(185%) !important;
                    box-shadow:
                      0 18px 42px rgba(0, 0, 0, 0.58),
                      0 0 28px rgba(168, 85, 247, 0.14),
                      inset 0 1px 1px rgba(255, 255, 255, 0.45) !important;
                  }
                  html.reelhouse-android .home-liquid-nav .app-bottom-nav-item {
                    color: #c7c9d2 !important;
                  }
                  html.reelhouse-android .home-liquid-nav .app-bottom-nav-item[aria-current="page"] {
                    color: #ffffff !important;
                    background: linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.07)) !important;
                    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3) !important;
                  }
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble {
                    display: block !important;
                    top: 8px !important;
                    z-index: 0 !important;
                    width: 44px !important;
                    height: 44px !important;
                    border-radius: 50% !important;
                    background: radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.5) 20%, rgba(236, 72, 153, 0.98) 48%, rgba(192, 38, 211, 0.92) 75%, rgba(147, 51, 234, 0.88) 100%) !important;
                    border: 1px solid rgba(255, 255, 255, 0.45) !important;
                    -webkit-backdrop-filter: blur(16px) saturate(220%) !important;
                    backdrop-filter: blur(16px) saturate(220%) !important;
                    box-shadow: 0 10px 26px rgba(236, 72, 153, 0.65), inset 4px 4px 12px rgba(255, 255, 255, 0.82), inset -4px -4px 10px rgba(0, 0, 0, 0.3) !important;
                    transition: left 420ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                  }
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble::before,
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble::after {
                    display: block !important;
                    content: '' !important;
                    position: absolute !important;
                    border-radius: 50% !important;
                    pointer-events: none !important;
                  }
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble::before {
                    top: 14% !important;
                    left: 18% !important;
                    width: 34% !important;
                    height: 24% !important;
                    background: rgba(255, 255, 255, 0.98) !important;
                    filter: blur(0.5px) !important;
                    transform: rotate(-30deg) !important;
                  }
                  html.reelhouse-android .app-bottom-nav .sliding-liquid-bubble::after {
                    top: 40% !important;
                    left: 14% !important;
                    width: 16% !important;
                    height: 14% !important;
                    background: rgba(255, 255, 255, 0.85) !important;
                    filter: blur(0.5px) !important;
                  }
                  html.reelhouse-android .app-bottom-nav .app-bottom-nav-item {
                    position: relative !important;
                    z-index: 10 !important;
                  }
                  html.reelhouse-android .home-liquid-orb {
                    animation: none !important;
                  }
                  html.reelhouse-android aside.mini-player[aria-label="Mini player"] {
                    left: 12px !important;
                    right: 12px !important;
                    bottom: calc(78px + env(safe-area-inset-bottom)) !important;
                    height: 58px !important;
                    padding: 5px 7px !important;
                    gap: 8px !important;
                    border-radius: 15px !important;
                    border: 1px solid #303138 !important;
                    background: #1a1b20 !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42) !important;
                  }
                  html.reelhouse-android .mini-player-art {
                    width: 72px !important;
                    height: 46px !important;
                    border-radius: 10px !important;
                  }
                  html.reelhouse-android .mini-player-art-overlay {
                    background: rgba(0, 0, 0, 0.22) !important;
                  }
                  html.reelhouse-android .mini-player p:first-child {
                    font-size: 13px !important;
                  }
                  html.reelhouse-android .mini-player p + p {
                    color: #888a93 !important;
                    font-size: 10px !important;
                  }
                  html.reelhouse-android aside.mini-player[aria-label="Mini player"] button {
                    width: 34px !important;
                    height: 34px !important;
                    flex: 0 0 34px !important;
                    border: 0 !important;
                    background: transparent !important;
                  }
                  html.reelhouse-android aside.mini-player[aria-label="Mini player"] button[aria-label="Play"],
                  html.reelhouse-android aside.mini-player[aria-label="Mini player"] button[aria-label="Pause"] {
                    color: #ffffff !important;
                    background: #ff5368 !important;
                  }
                  html.reelhouse-android .mini-player-progress > span {
                    background: #ff5368 !important;
                  }
                `;
                (document.head || root).appendChild(style);
              };

              install();
              if (!document.head) {
                document.addEventListener('DOMContentLoaded', install, { once: true });
              }
            })();
        """.trimIndent()

        private val LOCAL_FETCH_SCRIPT = """
            (() => {
              if (window.__reelhouseLocalBackendInstalled) return;
              window.__reelhouseLocalBackendInstalled = true;

              const nativeFetch = window.fetch.bind(window);
              const pending = new Map();
              let sequence = 0;

              ReelhouseAndroid.onmessage = (event) => {
                let response;
                try { response = JSON.parse(event.data); } catch (_) { return; }
                const entry = pending.get(response.id);
                if (!entry) return;
                pending.delete(response.id);
                clearTimeout(entry.timer);
                entry.resolve(new Response(response.body || '', {
                  status: response.status || 500,
                  headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'Cache-Control': 'no-store'
                  }
                }));
              };

              window.fetch = async (input, init = {}) => {
                const request = input instanceof Request ? input : null;
                const url = new URL(request ? request.url : String(input), location.href);
                if (url.origin !== location.origin ||
                    !url.pathname.startsWith('/api/backend/') ||
                    url.pathname.startsWith('/api/backend/account/')) {
                  return nativeFetch(input, init);
                }

                const id = 'native_' + Date.now() + '_' + (++sequence);
                const method = String(init.method || request?.method || 'GET').toUpperCase();
                let body = init.body;
                if (body == null && request && method !== 'GET' && method !== 'HEAD') {
                  body = await request.clone().text();
                }
                if (body != null && typeof body !== 'string') body = String(body);
                console.debug('PERF_BUILD_ID=offline-light-v3 phase=js_fetch route=' + url.pathname + ' id=' + id);

                return new Promise((resolve) => {
                  const timer = setTimeout(() => {
                    pending.delete(id);
                    resolve(new Response(JSON.stringify({
                      ok: false,
                      error: 'The Android local backend timed out.'
                    }), {
                      status: 504,
                      headers: {'Content-Type': 'application/json'}
                    }));
                  }, 180000);
                  pending.set(id, {resolve, timer});
                  ReelhouseAndroid.postMessage(JSON.stringify({
                    id,
                    path: url.pathname,
                    method,
                    body: body || ''
                  }));
                });
              };
            })();
        """.trimIndent()
    }
}

/** Streams the static export directly from APK assets without a cache or network request. */
private class StaticAssetsPathHandler(
    private val context: Context,
    private val pathPrefix: String = "web",
) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        val cleanPath = path.removePrefix("/")
        if (cleanPath.split('/').any { it == ".." }) return null

        val directAsset = if (cleanPath.isEmpty()) {
            "$pathPrefix/index.html"
        } else {
            "$pathPrefix/$cleanPath"
        }

        // Static export pages are emitted as route.html, while assets retain
        // their original paths. This keeps both client and hard navigations
        // local and avoids a full network round trip on every page change.
        createResponse(directAsset)?.let { return it }

        // Next's static export can only emit a placeholder file for dynamic
        // routes such as /player/[id]. On Android those routes still need to
        // work with the real local-download or video ID. Serve the exported
        // placeholder route and substitute only the serialized placeholder
        // parameter; the player then reads the real ID from useParams().
        createDynamicRouteResponse(cleanPath)?.let { return it }

        if (cleanPath.substringAfterLast('/', "").contains('.')) return null
        createResponse("$pathPrefix/$cleanPath.html")?.let { return it }
        createResponse("$pathPrefix/$cleanPath/index.html")?.let { return it }
        return createResponse("$pathPrefix/index.html")
    }

    private fun createDynamicRouteResponse(cleanPath: String): WebResourceResponse? {
        val route = DYNAMIC_ROUTES.firstOrNull { cleanPath.startsWith("$it/") }
            ?: return null
        val remainder = cleanPath.removePrefix("$route/")
        if (remainder.isEmpty()) return null

        val firstSlash = remainder.indexOf('/')
        val rawIdWithExtension = if (firstSlash == -1) remainder else remainder.substring(0, firstSlash)
        val isRouteDataFile = firstSlash == -1 && rawIdWithExtension.endsWith(".txt")
        val rawId = if (isRouteDataFile) rawIdWithExtension.removeSuffix(".txt") else rawIdWithExtension
        val routeId = Uri.decode(rawId)
        if (!SAFE_ROUTE_ID.matches(routeId)) return null

        val templatePath = when {
            isRouteDataFile -> "$pathPrefix/$route/placeholder.txt"
            firstSlash == -1 -> "$pathPrefix/$route/placeholder.html"
            else -> {
                val suffix = remainder.substring(firstSlash + 1)
                if (suffix.isEmpty() || suffix.split('/').any { it == ".." }) return null
                "$pathPrefix/$route/placeholder/$suffix"
            }
        }

        val template = try {
            context.assets.open(templatePath).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (_: Exception) {
            return null
        }
        val rendered = template
            .replace("\\\"placeholder\\\"", "\\\"$routeId\\\"")
            .replace("\"placeholder\"", "\"$routeId\"")
        return WebResourceResponse(
            mimeType(templatePath),
            "UTF-8",
            ByteArrayInputStream(rendered.toByteArray(Charsets.UTF_8)),
        )
    }

    private fun createResponse(assetPath: String): WebResourceResponse? {
        val mimeType = mimeType(assetPath)
        val encoding = if (
            mimeType.startsWith("text/") ||
            mimeType == "application/json" ||
            mimeType == "image/svg+xml"
        ) {
            "UTF-8"
        } else {
            null
        }

        val stream = try {
            context.assets.open(assetPath)
        } catch (_: Exception) {
            return null
        }
        return WebResourceResponse(mimeType, encoding, stream)
    }

    private fun mimeType(filePath: String): String = when (
        filePath.substringAfterLast('.', "").lowercase()
    ) {
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "html" -> "text/html"
        "json", "map" -> "application/json"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "svg" -> "image/svg+xml"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "ttf" -> "font/ttf"
        "otf" -> "font/otf"
        "ico" -> "image/x-icon"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    private companion object {
        val DYNAMIC_ROUTES = setOf("downloads", "music", "player", "playlists", "watch")
        val SAFE_ROUTE_ID = Regex("[A-Za-z0-9._~-]{1,200}")
    }

}
