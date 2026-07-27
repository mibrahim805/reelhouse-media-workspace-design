# Reelhouse Android notices

Reelhouse Android is a native, local-download client. It includes open-source
software and is intended to be distributed with complete corresponding source.

## Copyleft components

- `io.github.junkfood02.youtubedl-android:library:0.18.1` — GPL-3.0;
  source: <https://github.com/yausername/youtubedl-android>
- `io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1` — includes FFmpeg and
  native components under their applicable LGPL/GPL-compatible terms; wrapper
  source: <https://github.com/yausername/youtubedl-android>; FFmpeg source and
  licence information: <https://ffmpeg.org/legal.html>

The Android application is intended to be distributed under GPL-3.0-only so it
is licence-compatible with the bundled youtubedl-android library. Before public
distribution, publish the exact source used to build the APK, retain copyright
notices, include the complete licence in [COPYING](COPYING), and satisfy the
corresponding-source requirements for the included native components. This
notice is not legal advice.

## Other principal components

- yt-dlp — The Unlicense, with separately licensed bundled components;
  <https://github.com/yt-dlp/yt-dlp>
- Python — Python Software Foundation License;
  <https://docs.python.org/3/license.html>
- QuickJS — MIT; <https://bellard.org/quickjs/>
- Kotlin and kotlinx libraries — Apache-2.0;
  <https://github.com/JetBrains/kotlin>
- AndroidX, Jetpack Compose, Room, and DataStore — Apache-2.0;
  <https://android.googlesource.com/platform/frameworks/support/>
- Coil — Apache-2.0; <https://github.com/coil-kt/coil>

Transitive dependencies retain their respective copyrights and licence terms.
The resolved Gradle dependency graph is the authoritative version record for a
particular build.
