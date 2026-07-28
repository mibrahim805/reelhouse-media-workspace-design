# Reelhouse Android

This Android client renders the production Reelhouse web frontend in a secured
WebView, so its layout and interaction model stay aligned with the website.
An origin-scoped document-start bridge implements the website's backend API
contract with Kotlin and the embedded local media engine.

## Reelhouse YouTube workspace

The Android app loads the same production pages used by web visitors. Requests
from those pages to `/api/backend/*` are replaced before page JavaScript starts
and handled on the phone. Search, metadata extraction, quality discovery, and
downloads use the bundled local yt-dlp/FFmpeg engine and the phone's network.
The hosted Reelhouse backend is not part of the Android media path.

## Local data flow

1. Kotlin validates an HTTPS URL and rejects local/private destinations.
2. The embedded `youtubedl-android` runtime runs yt-dlp in the app process on an IO dispatcher.
3. Kotlin returns website-compatible JSON to the unchanged web UI.
4. `DownloadService` runs the selected job as an Android foreground service. Source media travels directly from the source to the phone.
5. The wrapper's FFmpeg component performs required merges or audio conversion locally.
6. Temporary output stays in the app cache. On Android 10 and newer, finished
   media is copied through MediaStore to `Downloads/Reelhouse`, or optionally
   `Movies/Reelhouse` / `Music/Reelhouse`. Android 7–9 uses the app-specific
   external media directory to avoid requesting storage permission.

The Android project is not built into the Railway deployment: the root
`.dockerignore` excludes `clients`, and the root Dockerfile does not copy this
directory. Railway serves the frontend pages/assets to the WebView, while an
origin-bound Android bridge prevents backend media API requests from leaving
the device.

## Build

Requirements: JDK 17 and Android SDK 35.

```bash
cd clients/android
./gradlew test
./gradlew lint
./gradlew assembleDebug
```

Debug APKs are emitted per ABI plus a universal APK. Release signing credentials are intentionally absent and must never be committed.

The application ID remains `com.reelhouse.app`, matching the earlier Android
client. This web-shell/local-backend release is version 1.5.2 with `versionCode 14`. An
installed build is upgrade-compatible only when it is signed with the same
private signing key.

## Engine and FFmpeg choice

The app uses `io.github.junkfood02.youtubedl-android:library:0.18.1` and `:ffmpeg:0.18.1`, the coordinates currently recommended by the maintainer. The GitHub project marks 0.18.1 as a pre-release and does not publish a separately designated stable wrapper release. The integration requires API 24+, supports the app's SDK 35/Gradle 8 setup as a consumed AAR, and bundles Python, yt-dlp, QuickJS, and FFmpeg native binaries.

The FFmpeg module is used because it is the integration expected by this wrapper; retired FFmpegKit is not used. FFmpeg significantly increases APK size. ABI-specific packages reduce the shareable APK size; the universal debug APK is convenient but much larger.

The engine update button requests only yt-dlp's official stable GitHub release. It downloads both `yt-dlp` and `SHA2-256SUMS`, verifies SHA-256, and atomically replaces the component only after verification. The bundled component remains the fallback. Updates cannot guarantee permanent extractor compatibility.

The update trust root is GitHub HTTPS plus the official `yt-dlp/yt-dlp`
publisher account. The checksum protects against corruption and asset mismatch,
but it is delivered through the same publisher channel rather than an
independent signing authority.

## Platform coverage

The app delegates source support to the bundled yt-dlp extractor set rather
than maintaining a small hard-coded platform list. It therefore attempts
public HTTPS URLs supported by yt-dlp, including common video and social-media
sites, but no individual platform is guaranteed: sites can change behavior,
restrict automated clients, require login, or prohibit downloads in their
terms. Public unauthenticated, non-DRM media is the supported product scope.

## Limitations

- Public, unauthenticated content only. The app does not read browser cookies or implement account login.
- No DRM circumvention, account-cookie import, or arbitrary yt-dlp arguments.
- Android force-stop and reboot terminate active jobs; the next launch marks interrupted jobs failed so the user can retry.
- On Android 15 and newer, `dataSync` foreground services have a platform-wide
  background time budget. The service handles the timeout and cancels cleanly,
  but a very long job can still be stopped by Android.
- The app validates the submitted host before extraction, but yt-dlp controls subsequent source redirects. This is a local client rather than a privileged server, and no local service is exposed.
- A physical device is required to prove public-IP origin, MediaStore behavior, notification cancellation, and source-specific extraction end to end.
- Platform terms and Google Play policies may prohibit downloader functionality for some sources. Distribution does not imply permission to download any particular media.

## Licence obligations

The youtubedl-android artifacts declare GPL-3.0. This Android subproject is
therefore intended for GPL-3.0-only distribution. Distributing an APK that
includes them requires GPL-compatible licensing, the full GPL text in
[COPYING](COPYING), complete notices, and corresponding-source compliance. See
[NOTICE.md](NOTICE.md).
yt-dlp, FFmpeg, Python, QuickJS, AndroidX, Kotlin, Coil, Room, and transitive
dependencies retain their own licences. Obtain legal review before public
distribution; this document is not legal advice.
