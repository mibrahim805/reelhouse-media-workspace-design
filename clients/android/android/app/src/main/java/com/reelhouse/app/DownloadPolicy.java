package com.reelhouse.app;

import java.io.File;
import java.net.URI;
import java.util.Locale;

final class DownloadPolicy {
    private DownloadPolicy() {}

    static boolean isAllowedMediaDownload(String rawUrl, String rawServerUrl) {
        return resolveAllowedMediaDownload(rawUrl, rawServerUrl, null, null) != null;
    }

    static String resolveAllowedMediaDownload(
        String rawUrl,
        String rawServerUrl,
        String contentDisposition,
        String mimeType
    ) {
        try {
            if (rawUrl == null || rawServerUrl == null) return null;

            URI serverUrl = new URI(rawServerUrl.trim()).normalize();
            if (!isHttpScheme(serverUrl.getScheme()) || serverUrl.getHost() == null) {
                return null;
            }

            URI candidate = new URI(rawUrl.trim());
            URI downloadUrl;
            if (candidate.isAbsolute()) {
                downloadUrl = candidate;
            } else if (rawUrl.trim().startsWith("/")) {
                downloadUrl = serverUrl.resolve(candidate);
            } else {
                String base = serverUrl.toString().replaceAll("/+$", "") + "/";
                downloadUrl = new URI(base).resolve(candidate);
            }
            downloadUrl = downloadUrl.normalize();

            if (!isSameHttpOrigin(serverUrl, downloadUrl)) return null;

            String path = downloadUrl.getPath();
            boolean knownMediaPath = isKnownMediaPath(path, serverUrl.getPath());
            boolean responseIsAttachment = containsToken(contentDisposition, "attachment");
            boolean responseIsMedia = isMediaMimeType(mimeType);

            if (!knownMediaPath && !responseIsAttachment && !responseIsMedia) {
                return null;
            }

            return downloadUrl.toASCIIString();
        } catch (Exception ignored) {
            return null;
        }
    }

    static String safeFilename(String value) {
        String cleaned = value == null
            ? "video.mp4"
            : value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        cleaned = cleaned.replaceAll("[. ]+$", "");
        return cleaned.isEmpty() ? "video.mp4" : cleaned;
    }

    static String uniqueFilename(File directory, String originalName) {
        String filename = safeFilename(originalName);
        File candidate = new File(directory, filename);
        int dot = filename.lastIndexOf('.');
        String stem = dot > 0 ? filename.substring(0, dot) : filename;
        String extension = dot > 0 ? filename.substring(dot) : "";
        int counter = 1;

        while (candidate.exists()) {
            candidate = new File(
                directory,
                stem + " (" + counter + ")" + extension
            );
            counter += 1;
        }

        return candidate.getName();
    }

    private static boolean isHttpScheme(String scheme) {
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private static boolean isSameHttpOrigin(URI serverUrl, URI downloadUrl) {
        return isHttpScheme(downloadUrl.getScheme()) &&
        serverUrl.getScheme().equalsIgnoreCase(downloadUrl.getScheme()) &&
        serverUrl.getHost() != null &&
        serverUrl.getHost().equalsIgnoreCase(downloadUrl.getHost()) &&
        serverUrl.getUserInfo() == null &&
        downloadUrl.getUserInfo() == null &&
        effectivePort(serverUrl) == effectivePort(downloadUrl);
    }

    private static boolean isKnownMediaPath(String path, String rawServerPath) {
        if (path == null) return false;

        String serverPath = rawServerPath == null || rawServerPath.equals("/")
            ? ""
            : rawServerPath.replaceAll("/+$", "");

        return path.startsWith("/api/backend/media/") ||
        path.startsWith("/media/") ||
        (!serverPath.isEmpty() &&
            (path.startsWith(serverPath + "/api/backend/media/") ||
                path.startsWith(serverPath + "/media/")));
    }

    private static boolean containsToken(String value, String token) {
        return value != null &&
        value.toLowerCase(Locale.ROOT).contains(token.toLowerCase(Locale.ROOT));
    }

    private static boolean isMediaMimeType(String value) {
        if (value == null) return false;
        String mimeType = value.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        return mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/") ||
        mimeType.equals("application/octet-stream") ||
        mimeType.equals("application/force-download");
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        if ("https".equalsIgnoreCase(uri.getScheme())) return 443;
        if ("http".equalsIgnoreCase(uri.getScheme())) return 80;
        return -1;
    }
}
