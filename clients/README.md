# Reelhouse native clients

Reelhouse has native wrappers for Windows and Ubuntu, an independent native
Android downloader, and a native Swift iPhone/iPad client.

| Platform | Package | Completed files |
| --- | --- | --- |
| Windows | Electron installer or portable `.exe` | The user's `Downloads\\Reelhouse` folder |
| Ubuntu | Electron `.AppImage` or `.deb` | The user's `Downloads/Reelhouse` folder |
| Android | Native Kotlin `.apk` | `Download/Reelhouse` on Android 10+ |
| iPhone / iPad | Native Swift app | `Files > On My iPhone/iPad > Reelhouse` |

The desktop clients connect directly to the production Kubeletto deployment:

```text
https://reelhouse.kubeletto.app
```

The Android app loads the production Kubeletto frontend in a WebView, while its
origin-scoped bridge handles backend API requests with the bundled yt-dlp and
FFmpeg engine locally on the phone. Video playback remains in the hosted UI;
media downloads do not pass through Kubeletto.

The Windows and Linux Electron clients load the same production frontend as the
website, so YouTube-only quality selection and automatic best-available quality
for TikTok, Instagram, Facebook, and other sources are shared across desktop
and browser clients. The iOS app uses a native WKWebView and saves completed
downloads into its Files-visible app folder.

## Configure the server

Set `REELHOUSE_SERVER_URL` when building either client:

```bash
REELHOUSE_SERVER_URL=https://reelhouse.example.com npm run dist:linux
```

The desktop app also lets each user change the address later from **Reelhouse >
Server settings**. Android does not need a server address.

For GitHub Actions, create a repository Actions variable named
`REELHOUSE_SERVER_URL` only when a different deployment should be packaged.

## Website download button

The website header includes **Download app**. Its package API reads desktop
files from `clients/desktop/dist` and Android APKs from
`clients/android/app/build/outputs/apk` by default. Override those
locations with `REELHOUSE_DESKTOP_RELEASE_DIR` and
`REELHOUSE_ANDROID_RELEASE_DIR`.

For separately hosted packages, set one or more of these server environment
variables to public HTTP or HTTPS URLs:

- `REELHOUSE_WINDOWS_DOWNLOAD_URL`
- `REELHOUSE_LINUX_APPIMAGE_URL`
- `REELHOUSE_LINUX_DEB_URL`
- `REELHOUSE_ANDROID_DOWNLOAD_URL`

The chooser only enables packages that exist locally or have a configured
remote URL. Browsers can download an installer, but the operating system always
requires the user to approve installation.

## Desktop development and builds

Node.js 22 or newer is required.

```bash
cd clients/desktop
npm ci
npm start
```

Build Ubuntu packages on Ubuntu:

```bash
npm run dist:linux
```

Build Windows packages on Windows:

```powershell
npm run dist:win
```

Packages are written to `clients/desktop/dist`. The packages are not code
signed, so Windows SmartScreen may warn during testing. A public production
release should use a Windows code-signing certificate.

## Android development and builds

Capacitor 8 requires Node.js 22 or newer and Java 21. The native project
targets Android API 36 and supports Android API 24 and newer. The device also
needs Android System WebView 111 or newer because the shared Next.js 16 and
Tailwind CSS 4 frontend depends on that browser baseline. Older WebViews receive
an in-app update screen instead of a broken, unstyled page.

```bash
cd clients/android
npm ci
npm run sync
cd android
./gradlew assembleDebug
```

The APK is written to
`clients/android/android/app/build/outputs/apk/debug/app-debug.apk`. A tester can
enable installation from unknown sources and install that file, or use:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Downloads started inside the Android app are handed to Android's native
Download Manager and saved as `Internal storage/Download/<filename>`. Android
10 and newer do not show a storage permission dialog for files the app creates
in this public folder. Android 13 and newer asks for notification permission so
native download progress and completion can remain visible; Android 9 and older
asks for legacy storage permission when the first download starts. The app does
not request broad photo/video library access because it does not need to read
files created by other apps.

The debug APK is suitable for private testing. A store or public release needs
a persistent release signing key and the normal Android publishing process.

## Build all platforms in GitHub Actions

The `Build native clients` workflow builds each platform on its native runner.
Open the repository's **Actions** tab, run the workflow, and download these
artifacts when all three jobs finish:

- `reelhouse-windows` — installer and portable `.exe`
- `reelhouse-ubuntu` — `.AppImage` and `.deb`
- `reelhouse-android` — installable debug `.apk`

Deploying the website to Render can give the apps a stable server address, but
it does not change browser-controlled saving. Direct native saving is provided
by these clients: Electron assigns the desktop file path before transfer, and
Android uses the operating system Download Manager.
