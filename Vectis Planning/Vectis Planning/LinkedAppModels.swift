import SwiftUI
import UIKit

/// One app in the catalog. `scheme` is what actually opens it — a URL
/// like "spotify://" that iOS routes to the installed app.
struct LinkableApp: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var scheme: String
    var sfSymbol: String

    /// Optional brand color override from the catalog. Most apps don't
    /// set one and fall back to the app's own accent.
    var brandHex: String?
}

struct LinkableAppCategory: Codable, Identifiable {
    var id: String
    var name: String
    var apps: [LinkableApp]
}

private struct LinkedAppsFile: Codable {
    var categories: [LinkableAppCategory]
}

/// An app the user added themselves by pasting a URL scheme, for
/// anything not in the built-in catalog.
struct CustomApp: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var scheme: String
}

enum LinkedAppsCatalog {
    static func load() -> [LinkableAppCategory] {
        guard let url = Bundle.main.url(forResource: "LinkedApps", withExtension: "json") else {
            print("Vectis: LinkedApps.json not found in bundle")
            return []
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(LinkedAppsFile.self, from: data).categories
        } catch {
            print("Vectis: failed to decode LinkedApps.json — \(error)")
            return []
        }
    }

    /// Brand colors for the catalog apps.
    ///
    /// A few are deliberately NOT the official brand color: Kindle's is
    /// near-black and YouTube's pure red both disappear or vibrate
    /// against dark backgrounds. These are adjusted to stay legible in
    /// both light and dark mode, which matters more here than exactness.
    static let brandColors: [String: String] = [
        "books": "FF9500",
        "kindle": "5A8FA8",          // adjusted — official is near-black
        "audible": "F8991C",
        "applenews": "FA2E48",
        "fitness": "A2FC3B",
        "health": "FF2D55",
        "strava": "FC4C02",
        "headspace": "FF7E1D",
        "insight": "5B4DB1",
        "applemusic": "FA243C",
        "spotify": "1DB954",
        "podcasts": "9933FF",
        "notes": "FFCC00",
        "reminders": "FF9500",
        "calendar": "FF3B30",
        "googledrive": "4285F4",
        "googlekeep": "FBBC04",
        "duolingo": "58CC02",
        "translate": "4285F4",
        "instagram": "E1306C",
        "youtube": "E8342A",         // adjusted — pure FF0000 vibrates on dark
        "whatsapp": "25D366",
        "gospellibrary": "3A6EA5",
        "sacredmusic": "7B5EA7",
        "wallet": "1A1A1A",
        "stocks": "34C759"
    ]

    static func color(for appID: String) -> Color {
        Color(hex: brandColors[appID] ?? "8E8E93")
    }
}

/// Checks whether an app is actually installed.
///
/// iOS only answers this for schemes declared upfront in Info.plist
/// under LSApplicationQueriesSchemes. Anything not declared there always
/// comes back false, which is why the catalog and that list have to
/// stay in sync — see the note in LinkedApps.json.
enum AppLauncher {
    static func isInstalled(_ scheme: String) -> Bool {
        guard let url = URL(string: scheme) else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    /// Opens the app. Returns false if the scheme was invalid or iOS
    /// refused, so the caller can tell you rather than silently doing
    /// nothing.
    @discardableResult
    static func open(_ scheme: String) -> Bool {
        guard let url = URL(string: scheme), UIApplication.shared.canOpenURL(url) else {
            return false
        }
        UIApplication.shared.open(url)
        return true
    }
}

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension CustomApp {
    enum CodingKeys: String, CodingKey {
        case id, name, scheme
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        scheme = try c.decodeIfPresent(String.self, forKey: .scheme) ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(scheme, forKey: .scheme)
    }
}
