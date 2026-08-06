# Reelhouse iOS app

This is the native iPhone/iPad client. It is a SwiftUI app containing a
`WKWebView` for the shared Reelhouse interface and a native `WKDownload`
handler for completed media files.

Downloaded files are saved to:

```text
Files > On My iPhone/iPad > Reelhouse
```

## Build

Open `Reelhouse.xcodeproj` in Xcode on macOS, select an iPhone simulator or a
connected device, choose a signing team, and run the `Reelhouse` scheme. A
published App Store build requires an Apple Developer account, signing, and
the normal App Store review process.

The app loads the production Reelhouse URL from
`Reelhouse/ContentView.swift`. Change that URL before signing a build for a
different deployment.
