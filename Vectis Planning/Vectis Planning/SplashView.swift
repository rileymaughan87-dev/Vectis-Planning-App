import SwiftUI

/// Shown briefly when the app launches — just the wordmark on a plain
/// background, nothing else.
///
/// This is a SwiftUI view rather than a true native iOS launch screen.
/// A native one shows instantly, before any Swift code runs, but
/// configuring one means using Xcode's own storyboard or Info.plist
/// editor directly — not something that can be handed over as a Swift
/// file to paste in. This trades a barely-perceptible instant of blank
/// background for being fully buildable and adjustable through code,
/// like everything else in this project.
struct SplashView: View {
    // Its own store, separate from ContentView's, purely to read the
    // current primary colour for the wordmark. Both read the same
    // saved file and this one never writes to it, so there's no risk
    // of the two disagreeing — just a cheap, independent read.
    @StateObject private var appearanceStore = AppearanceStore()

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            Text("Vectis")
                .font(.system(size: 44, design: .serif).italic().weight(.medium))
                .foregroundStyle(appearanceStore.primaryColor)
        }
    }
}
