package com.reelhouse.downloader

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import java.io.File

private const val REELHOUSE_URL =
    "https://reelhouse-media-workspace-design-production.up.railway.app"
private const val REELHOUSE_HOST =
    "reelhouse-media-workspace-design-production.up.railway.app"

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(-1, -1)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = "${settings.userAgentString} ReelhouseAndroid/${BuildConfig.VERSION_NAME}"
            webChromeClient = WebChromeClient()
            webViewClient = ReelhouseWebViewClient()
            setDownloadListener { url, userAgent, disposition, mimeType, _ ->
                startDeviceDownload(url, userAgent, disposition, mimeType)
            }
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }
        setContentView(webView)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
        if (savedInstanceState == null) webView.loadUrl(initialUrl(intent))
        else webView.restoreState(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        webView.loadUrl(initialUrl(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        webView.apply { stopLoading(); loadUrl("about:blank"); removeAllViews(); destroy() }
        super.onDestroy()
    }

    private fun initialUrl(intent: Intent?): String {
        val shared = if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain")
            intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() else null
        return if (!shared.isNullOrBlank()) "$REELHOUSE_URL/downloader?url=${Uri.encode(shared)}" else REELHOUSE_URL
    }

    private fun startDeviceDownload(rawUrl: String, userAgent: String?, disposition: String?, mimeType: String?) {
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull()
        if (uri?.scheme != "https" || uri.host != REELHOUSE_HOST) {
            Toast.makeText(this, "Blocked an untrusted download address.", Toast.LENGTH_LONG).show()
            return
        }
        val filename = URLUtil.guessFileName(rawUrl, disposition, mimeType)
            .replace(Regex("""[\\/:*?"<>|]"""), "_")
        val request = DownloadManager.Request(uri).apply {
            setTitle(filename)
            setDescription("Downloading with Reelhouse")
            setMimeType(mimeType ?: "application/octet-stream")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            userAgent?.takeIf { it.isNotBlank() }?.let { addRequestHeader("User-Agent", it) }
            CookieManager.getInstance().getCookie(rawUrl)?.let { addRequestHeader("Cookie", it) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Reelhouse/$filename")
            } else {
                val dir = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Reelhouse").apply { mkdirs() }
                setDestinationUri(Uri.fromFile(uniqueFile(dir, filename)))
            }
        }
        (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        Toast.makeText(this, "Downloading $filename", Toast.LENGTH_SHORT).show()
    }

    private fun uniqueFile(directory: File, filename: String): File {
        val first = File(directory, filename)
        if (!first.exists()) return first
        val extension = filename.substringAfterLast('.', "")
        val stem = if (extension.isBlank()) filename else filename.dropLast(extension.length + 1)
        var counter = 1
        while (true) {
            val suffix = if (extension.isBlank()) " ($counter)" else " ($counter).$extension"
            val candidate = File(directory, "$stem$suffix")
            if (!candidate.exists()) return candidate
            counter++
        }
    }

    private inner class ReelhouseWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            val uri = request.url
            if (uri.scheme == "https" && uri.host == REELHOUSE_HOST) return false
            if (uri.scheme == "http" || uri.scheme == "https") startActivity(Intent(Intent.ACTION_VIEW, uri))
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            view.loadDataWithBaseURL(REELHOUSE_URL, """
                <html><meta name="viewport" content="width=device-width"><body style="background:#18181b;color:#fafafa;font-family:sans-serif;padding:32px">
                <h2>Reelhouse is offline</h2><p>Check your internet connection and try again.</p>
                <button onclick="location.href='$REELHOUSE_URL'">Retry</button></body></html>
            """.trimIndent(), "text/html", "UTF-8", null)
        }
    }
}
