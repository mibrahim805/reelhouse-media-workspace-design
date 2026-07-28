package com.reelhouse.downloader

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
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
        window.statusBarColor = Color.rgb(24, 24, 28)
        window.navigationBarColor = Color.rgb(24, 24, 28)

        localBackend = LocalWebBackend(application as ReelhouseApp)
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
                    window.decorView.systemUiVisibility = (
                        View.SYSTEM_UI_FLAG_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        )
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }

                override fun onHideCustomView() {
                    exitFullscreen()
                }
            }
            setDownloadListener { url, _, _, _, _ ->
                if (url.startsWith(LOCAL_RESULT_SCHEME)) showSavedMessage(Uri.parse(url))
            }
            webViewClient = ReelhouseWebViewClient()
        }
        setContentView(webView)

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

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        webView.visibility = View.VISIBLE
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
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
