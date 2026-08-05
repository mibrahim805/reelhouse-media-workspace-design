package com.reelhouse.downloader

import android.annotation.SuppressLint
import android.content.Intent
import android.app.DownloadManager
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
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
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Android renders the production web frontend unchanged. A document-start,
 * origin-bound bridge replaces only the `/api/backend/…` fetches with the embedded
 * device backend, so media extraction and downloads never use Railway.
 */
class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var localBackend: LocalWebBackend
    private val webBaseUrl = BuildConfig.REELHOUSE_WEB_BASE_URL.trimEnd('/')
    private val trustedOrigin = URI(webBaseUrl).let { "${it.scheme}://${it.host}" }
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
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
                userAgentString = "$userAgentString ReelhouseAndroid/${BuildConfig.VERSION_NAME}"
            }
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
            setDownloadListener { url, _, _, _, _ ->
                if (url.startsWith(LOCAL_RESULT_SCHEME)) {
                    showSavedMessage(Uri.parse(url))
                } else if (url.startsWith("http://") || url.startsWith("https://")) {
                    enqueueExternalDownload(Uri.parse(url))
                }
            }
            webViewClient = ReelhouseWebViewClient()
        }
        setContentView(webView)
        installSafeContentInsets()

        checkBridgeSupport()
        installLocalBackendBridge()
        webView.loadUrl(initialUrl(intent))

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (fullscreenView != null) {
                        exitFullscreen()
                    } else if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            },
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedText(intent)?.let {
            webView.loadUrl("$webBaseUrl/downloader?url=${Uri.encode(it)}")
        }
    }

    override fun onDestroy() {
        exitFullscreen()
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
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
            if (fullscreenView != null) {
                view.setPadding(0, 0, 0, 0)
                return@setOnApplyWindowInsetsListener windowInsets
            }

            val safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout(),
            )
            val keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(
                safe.left,
                safe.top,
                safe.right,
                maxOf(safe.bottom, keyboard.bottom),
            )
            windowInsets
        }
        ViewCompat.requestApplyInsets(webView)
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
    }

    private fun initialUrl(intent: Intent?): String =
        sharedText(intent)?.let { "$webBaseUrl/downloader?url=${Uri.encode(it)}" }
            ?: webBaseUrl

    private fun sharedText(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf(String::isNotBlank)
        } else {
            null
        }

    private inner class ReelhouseWebViewClient : WebViewClient() {
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
            if (uri.scheme == "https" && uri.host == URI(webBaseUrl).host) return false
            if (uri.scheme == "https" && uri.host.isYoutubeHost()) return false

            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            return true
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? {
            val uri = request.url
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
            return null
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
        ViewCompat.requestApplyInsets(webView)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }

    private fun showSavedMessage(uri: Uri) {
        val id = uri.host ?: uri.lastPathSegment.orEmpty()
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

    private fun enqueueExternalDownload(uri: Uri) {
        val name = uri.lastPathSegment?.substringAfterLast('/')
            ?.takeIf { it.isNotBlank() && it.length <= 120 }
            ?: "reelhouse-video.mp4"
        val request = DownloadManager.Request(uri)
            .setTitle(name)
            .setDescription("Reelhouse download")
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
        private const val LOCAL_RESULT_SCHEME = "reelhouse-local"

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
                console.debug('PERF_BUILD_ID=cache-debug-v2 phase=js_fetch route=' + url.pathname + ' id=' + id);

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
