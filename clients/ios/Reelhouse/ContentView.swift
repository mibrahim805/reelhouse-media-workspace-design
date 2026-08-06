import SwiftUI

struct ContentView: View {
    var body: some View {
        ReelhouseWebView(url: URL(string: ReelhouseConfiguration.serverURL)!)
            .ignoresSafeArea(edges: .bottom)
    }
}

enum ReelhouseConfiguration {
    static let serverURL = "https://reelhouse-media-workspace-design-production.up.railway.app"
}
