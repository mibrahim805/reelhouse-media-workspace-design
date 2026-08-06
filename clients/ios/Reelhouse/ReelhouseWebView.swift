import Foundation
import UIKit
import WebKit
import SwiftUI

struct ReelhouseWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = "ReelhouseIOS/1.0"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard webView.url == nil else { return }
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        private let applicationHost = URL(string: ReelhouseConfiguration.serverURL)?.host

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let target = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if isTrusted(target) || navigationAction.navigationType == .other {
                decisionHandler(.allow)
                return
            }

            // Keep the native app focused on Reelhouse and open unrelated
            // links in Safari instead of replacing the app's main screen.
            if ["http", "https"].contains(target.scheme?.lowercased()) {
                UIApplication.shared.open(target)
            }
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let target = navigationAction.request.url {
                webView.load(URLRequest(url: target))
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            guard let response = navigationResponse.response as? HTTPURLResponse else {
                decisionHandler(.allow)
                return
            }

            let disposition = response.value(forHTTPHeaderField: "Content-Disposition")?.lowercased() ?? ""
            let mimeType = response.mimeType?.lowercased() ?? ""
            let shouldDownload = disposition.contains("attachment") ||
                mimeType.hasPrefix("video/") ||
                mimeType.hasPrefix("audio/")

            decisionHandler(shouldDownload ? .download : .allow)
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let fileManager = FileManager.default
            guard let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
                completionHandler(nil)
                return
            }

            let directory = documents.appendingPathComponent("Reelhouse", isDirectory: true)
            do {
                try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
                completionHandler(uniqueURL(in: directory, filename: suggestedFilename))
            } catch {
                completionHandler(nil)
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            // The web download manager displays the failed state in the app.
        }

        func downloadDidFinish(_ download: WKDownload) {
            // Files are visible in Files > On My iPhone > Reelhouse.
        }

        private func isTrusted(_ url: URL) -> Bool {
            guard url.scheme?.lowercased() == "https" else { return false }
            let host = url.host?.lowercased()
            return host == applicationHost ||
                host == "youtube.com" ||
                host?.hasSuffix(".youtube.com") == true ||
                host == "youtu.be"
        }

        private func uniqueURL(in directory: URL, filename: String) -> URL {
            let safeName = filename.isEmpty ? "download" : filename
            let fileExtension = (safeName as NSString).pathExtension
            let stem = (safeName as NSString).deletingPathExtension
            var candidate = directory.appendingPathComponent(safeName)
            var counter = 1

            while FileManager.default.fileExists(atPath: candidate.path) {
                let numbered = fileExtension.isEmpty
                    ? "\(stem) (\(counter))"
                    : "\(stem) (\(counter)).\(fileExtension)"
                candidate = directory.appendingPathComponent(numbered)
                counter += 1
            }
            return candidate
        }
    }
}
