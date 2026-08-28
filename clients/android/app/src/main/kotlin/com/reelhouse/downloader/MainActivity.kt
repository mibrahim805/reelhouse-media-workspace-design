package com.reelhouse.downloader

import android.annotation.SuppressLint
import android.Manifest
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.ContentUris
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
import android.provider.MediaStore
import android.provider.Settings
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
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
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
    private var appUpdateDownloadId = INVALID_DOWNLOAD_ID
    private var pendingInstallerUri: Uri? = null
    private var appUpdateDialog: AlertDialog? = null
    private var appUpdateCheckInFlight = false
    private var updatePermissionDialog: AlertDialog? = null
    private var updateReceiverRegistered = false
    private val updatePreferences by lazy {
        getSharedPreferences("app_update", MODE_PRIVATE)
    }
    private val appUpdateDownloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: android.content.Context, intent: Intent) {
            val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (downloadId == appUpdateDownloadId) {
                handleAppUpdateDownload(downloadId)
            }
        }
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
                if (url.startsWith(LOCAL_RESULT_SCHEME) || localMediaId(Uri.parse(url)) != null) {
                    showSavedMessage(Uri.parse(url))
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
        registerAppUpdateReceiver()
        restoreAppUpdateDownload()

        checkBridgeSupport()
        installLocalBackendBridge()
        // Always render the hosted Kubeletto frontend. The Android bridge still
        // handles media operations locally, but the native Compose shell must
        // not replace the production UI based on a false network check.
        webView.loadUrl(initialUrl(intent))

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (fullscreenView != null) {
                        exitFullscreen()
                    } else {
                        // Let transient web UI (such as the Home quality dialog)
                        // consume Back before changing the WebView history.
                        webView.evaluateJavascript(
                            "window.__reelhouseHandleBack ? window.__reelhouseHandleBack() : false",
                        ) { handled ->
                            if (handled != "true") {
                                if (webView.canGoBack()) webView.goBack() else finish()
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

    override fun onResume() {
        super.onResume()
        tryInstallPendingUpdate()
    }

    override fun onStart() {
        super.onStart()
        if (appUpdateDownloadId == INVALID_DOWNLOAD_ID && pendingInstallerUri == null) {
            checkForAppUpdate()
        }
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        applySystemThemeToWebView()
    }

    private fun applySystemThemeToWebView() {
        val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        val color = if (dark) Color.rgb(9, 9, 9) else Color.rgb(245, 245, 247)
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
        appUpdateDialog?.dismiss()
        appUpdateDialog = null
        updatePermissionDialog?.dismiss()
        updatePermissionDialog = null
        if (updateReceiverRegistered) {
            unregisterReceiver(appUpdateDownloadReceiver)
            updateReceiverRegistered = false
        }
        exitFullscreen()
        webView.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        super.onDestroy()
    }

    private fun registerAppUpdateReceiver() {
        ContextCompat.registerReceiver(
            this,
            appUpdateDownloadReceiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        updateReceiverRegistered = true
    }

    private fun restoreAppUpdateDownload() {
        appUpdateDownloadId = updatePreferences
            .getLong(KEY_UPDATE_DOWNLOAD_ID, INVALID_DOWNLOAD_ID)
        if (appUpdateDownloadId == INVALID_DOWNLOAD_ID) return

        val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        manager.query(DownloadManager.Query().setFilterById(appUpdateDownloadId)).use { cursor ->
            if (!cursor.moveToFirst()) {
                clearAppUpdateDownload()
                return
            }
            when (cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
                DownloadManager.STATUS_SUCCESSFUL -> handleAppUpdateDownload(appUpdateDownloadId)
                DownloadManager.STATUS_FAILED -> {
                    Toast.makeText(this, "The app update download failed. Please try again.", Toast.LENGTH_LONG).show()
                    clearAppUpdateDownload()
                }
            }
        }
    }

    private fun checkForAppUpdate() {
        if (appUpdateCheckInFlight || appUpdateDialog?.isShowing == true) return
        appUpdateCheckInFlight = true
        lifecycleScope.launch {
            try {
                val update = AppUpdateChecker(webBaseUrl).check() ?: return@launch
                if (
                    !isFinishing
                    && !isDestroyed
                    && appUpdateDownloadId == INVALID_DOWNLOAD_ID
                    && pendingInstallerUri == null
                ) {
                    showAppUpdateDialog(update)
                }
            } finally {
                appUpdateCheckInFlight = false
            }
        }
    }

    private fun showAppUpdateDialog(update: AppUpdateInfo) {
        if (isFinishing || isDestroyed) return
        appUpdateDialog = AlertDialog.Builder(this)
            .setTitle("Update available")
            .setMessage(
                "Reelhouse ${update.versionName} is available. Update now to get the latest version?",
            )
            .setPositiveButton("Update") { _, _ -> startAppUpdate(update) }
            .setNegativeButton("Cancel", null)
            .setCancelable(false)
            .show()
    }

    private fun startAppUpdate(update: AppUpdateInfo) {
        if (appUpdateDownloadId != INVALID_DOWNLOAD_ID) return
        val updateFile = File(
            getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: cacheDir,
            "Reelhouse-update-${update.versionCode}-${System.currentTimeMillis()}.apk",
        )
        val request = DownloadManager.Request(
            Uri.parse("$webBaseUrl/api/app-download/android"),
        )
            .setTitle("Reelhouse ${update.versionName}")
            .setDescription("Downloading app update")
            .setMimeType(APK_MIME_TYPE)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(updateFile))

        try {
            appUpdateDownloadId = (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            updatePreferences.edit().putLong(KEY_UPDATE_DOWNLOAD_ID, appUpdateDownloadId).apply()
            Toast.makeText(this, "Downloading Reelhouse update…", Toast.LENGTH_LONG).show()
        } catch (error: Exception) {
            clearAppUpdateDownload()
            Toast.makeText(this, "Could not start the app update download.", Toast.LENGTH_LONG).show()
            Log.e("ReelhouseUpdate", "Could not enqueue app update", error)
        }
    }

    private fun handleAppUpdateDownload(downloadId: Long) {
        val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        manager.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
            if (!cursor.moveToFirst()) {
                clearAppUpdateDownload()
                return
            }
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                Log.e("ReelhouseUpdate", "App update download failed: reason=$reason")
                Toast.makeText(this, "The app update download failed. Please try again.", Toast.LENGTH_LONG).show()
                clearAppUpdateDownload()
                return
            }
        }

        val downloadedUri = manager.getUriForDownloadedFile(downloadId)
        if (downloadedUri == null) {
            Toast.makeText(this, "The app update file could not be opened.", Toast.LENGTH_LONG).show()
            clearAppUpdateDownload()
            return
        }
        pendingInstallerUri = downloadedUri
        clearAppUpdateDownload()
        tryInstallPendingUpdate()
    }

    private fun tryInstallPendingUpdate() {
        val sourceUri = pendingInstallerUri ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            if (updatePermissionDialog?.isShowing == true) return
            updatePermissionDialog = AlertDialog.Builder(this)
                .setTitle("Allow app installation")
                .setMessage("Android needs permission to install this Reelhouse update. Enable it, then return to continue.")
                .setPositiveButton("Open settings") { _, _ ->
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:$packageName"),
                        ),
                    )
                }
                .setNegativeButton("Cancel") { _, _ -> pendingInstallerUri = null }
                .create()
                .also { it.show() }
            return
        }
        updatePermissionDialog?.dismiss()
        updatePermissionDialog = null

        val installerUri = runCatching {
            if (sourceUri.scheme == "file") {
                FileProvider.getUriForFile(
                    this,
                    "${BuildConfig.APPLICATION_ID}.files",
                    File(requireNotNull(sourceUri.path)),
                )
            } else {
                sourceUri
            }
        }.getOrNull()
        if (installerUri == null) {
            pendingInstallerUri = null
            Toast.makeText(this, "The app update file could not be opened.", Toast.LENGTH_LONG).show()
            return
        }

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(installerUri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(installIntent)
            pendingInstallerUri = null
        } catch (error: Exception) {
            Log.e("ReelhouseUpdate", "Could not open Android package installer", error)
            Toast.makeText(this, "Android could not open the app installer.", Toast.LENGTH_LONG).show()
        }
    }

    private fun clearAppUpdateDownload() {
        appUpdateDownloadId = INVALID_DOWNLOAD_ID
        updatePreferences.edit().remove(KEY_UPDATE_DOWNLOAD_ID).apply()
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
                // Keep the hosted UI visible even when the network fails. Do
                // not replace it with the legacy native/offline shell.
                Log.e("ReelhouseWebView", "Hosted frontend failed: ${error.description}")
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
        private const val LOCAL_RESULT_SCHEME = "reelhouse-local"
        private const val MEDIA_PERMISSION_REQUEST = 7001
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private const val KEY_UPDATE_DOWNLOAD_ID = "download_id"
        private const val INVALID_DOWNLOAD_ID = -1L
        private val RANGE_PATTERN = Regex("bytes=(\\d+)-(\\d*)", RegexOption.IGNORE_CASE)

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
