package com.reelhouse.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final int STORAGE_PERMISSION_REQUEST = 4201;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4202;
    private static final int WEB_CACHE_VERSION = 4;
    private static final String WEBVIEW_PREFS = "reelhouse_webview";
    private static final String LAST_APP_VERSION = "last_app_version";
    private static final String NOTIFICATION_PERMISSION_ASKED =
        "notification_permission_asked";
    private PendingDownload pendingDownload;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        prepareRemoteApp();
        bridge.getWebView().setDownloadListener(
            (url, userAgent, contentDisposition, mimeType, contentLength) ->
                requestDownload(
                    new PendingDownload(
                        url,
                        userAgent,
                        contentDisposition,
                        mimeType,
                        contentLength
                    )
                )
        );
    }

    private void prepareRemoteApp() {
        if (!bridge.isMinimumWebViewInstalled()) {
            return;
        }

        WebView webView = bridge.getWebView();
        int lastVersion = getSharedPreferences(WEBVIEW_PREFS, MODE_PRIVATE).getInt(
            LAST_APP_VERSION,
            -1
        );
        boolean cacheCleared = lastVersion != WEB_CACHE_VERSION;

        if (cacheCleared) {
            webView.stopLoading();
            webView.clearCache(true);
            getSharedPreferences(WEBVIEW_PREFS, MODE_PRIVATE)
                .edit()
                .putInt(LAST_APP_VERSION, WEB_CACHE_VERSION)
                .apply();
        }

        String serverUrl = bridge.getServerUrl();
        if (serverUrl != null && (cacheCleared || isNgrokUrl(serverUrl))) {
            Map<String, String> headers = new HashMap<>();
            if (isNgrokUrl(serverUrl)) {
                headers.put("ngrok-skip-browser-warning", "1");
            }
            webView.stopLoading();
            webView.loadUrl(serverUrl, headers);
        }
    }

    private boolean isNgrokUrl(String value) {
        String host = Uri.parse(value).getHost();
        if (host == null) {
            return false;
        }

        return host.endsWith(".ngrok-free.app") ||
            host.endsWith(".ngrok-free.dev") ||
            host.endsWith(".ngrok.io");
    }

    private void requestDownload(PendingDownload download) {
        String trustedUrl = DownloadPolicy.resolveAllowedMediaDownload(
            download.url,
            bridge.getServerUrl(),
            download.contentDisposition,
            download.mimeType
        );
        if (trustedUrl == null) {
            Toast.makeText(
                this,
                "Blocked a download outside Reelhouse.",
                Toast.LENGTH_LONG
            ).show();
            return;
        }
        download = download.withUrl(trustedUrl);

        if (
            Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = download;
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE },
                STORAGE_PERMISSION_REQUEST
            );
            return;
        }

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED &&
            !getSharedPreferences(WEBVIEW_PREFS, MODE_PRIVATE).getBoolean(
                NOTIFICATION_PERMISSION_ASKED,
                false
            )
        ) {
            pendingDownload = download;
            getSharedPreferences(WEBVIEW_PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(NOTIFICATION_PERMISSION_ASKED, true)
                .apply();
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_PERMISSION_REQUEST
            );
            return;
        }

        enqueueDownload(download);
    }

    private void enqueueDownload(PendingDownload download) {
        try {
            String filename = DownloadPolicy.uniqueFilename(
                Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS
                ),
                URLUtil.guessFileName(
                    download.url,
                    download.contentDisposition,
                    download.mimeType
                )
            );
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download.url));
            request.setTitle(filename);
            request.setDescription("Saving to Files > Downloads");
            request.setMimeType(
                download.mimeType == null || download.mimeType.isEmpty()
                    ? "application/octet-stream"
                    : download.mimeType
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

            if (download.userAgent != null && !download.userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", download.userAgent);
            }

            String cookies = CookieManager.getInstance().getCookie(download.url);
            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }
            request.addRequestHeader("Referer", bridge.getServerUrl());
            if (isNgrokUrl(download.url)) {
                request.addRequestHeader("ngrok-skip-browser-warning", "1");
            }

            DownloadManager manager =
                (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                throw new IllegalStateException("Android Download Manager is unavailable");
            }
            manager.enqueue(request);
            Toast.makeText(
                this,
                "Download started. Find " + filename + " in Files > Downloads.",
                Toast.LENGTH_LONG
            ).show();
        } catch (Exception error) {
            Toast.makeText(
                this,
                "Could not save the video: " + error.getMessage(),
                Toast.LENGTH_LONG
            ).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (pendingDownload == null) {
            return;
        }

        PendingDownload download = pendingDownload;
        if (requestCode == STORAGE_PERMISSION_REQUEST) {
            pendingDownload = null;
            if (
                grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            ) {
                enqueueDownload(download);
            } else {
                Toast.makeText(
                    this,
                    "Storage permission is required on this older Android version.",
                    Toast.LENGTH_LONG
                ).show();
            }
            return;
        }

        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            pendingDownload = null;
            enqueueDownload(download);
        }
    }

    private static class PendingDownload {
        final String url;
        final String userAgent;
        final String contentDisposition;
        final String mimeType;
        final long contentLength;

        PendingDownload(
            String url,
            String userAgent,
            String contentDisposition,
            String mimeType,
            long contentLength
        ) {
            this.url = url;
            this.userAgent = userAgent;
            this.contentDisposition = contentDisposition;
            this.mimeType = mimeType;
            this.contentLength = contentLength;
        }

        PendingDownload withUrl(String trustedUrl) {
            return new PendingDownload(
                trustedUrl,
                userAgent,
                contentDisposition,
                mimeType,
                contentLength
            );
        }
    }
}
