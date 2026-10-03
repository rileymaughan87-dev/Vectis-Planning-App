import Foundation

/// Saves and loads app data as JSON files in the app's Documents folder.
///
/// This is deliberately simple: one file per store, written whenever
/// something changes, read once on launch. For a personal planner's
/// volume of data that's completely fine — no database needed, no
/// external dependencies, and the files are plain JSON you could
/// inspect or back up by hand if you ever wanted to.
///
/// Everything here is `static` because there's no state to hold; it's
/// just a set of helper functions grouped under one name.
enum PersistenceManager {

    /// The app's own private Documents folder. Every app on iOS gets
    /// one, sandboxed so no other app can read it, and it survives
    /// app updates (unlike caches, which iOS can clear at will).
    private static var documentsURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    private static func fileURL(_ filename: String) -> URL {
        documentsURL.appendingPathComponent(filename)
    }

    /// Writes any Codable value to a named file. Failures are logged
    /// rather than crashing — losing one save is recoverable, a crash
    /// mid-edit is not.
    static func save<T: Encodable>(_ value: T, to filename: String) {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            // ISO 8601 keeps dates readable in the file and avoids the
            // timezone ambiguity you get with raw timestamps.
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(value)
            try data.write(to: fileURL(filename), options: .atomic)
        } catch {
            print("Vectis: failed to save \(filename) — \(error)")
        }
    }

    /// Reads a Codable value back from a named file, or returns nil if
    /// the file doesn't exist yet (first launch) or can't be read.
    ///
    /// A file that exists but can't be read is moved aside before
    /// returning nil. Every store treats nil as "start fresh", and the
    /// next save would otherwise write straight over the only copy of
    /// the data. Set aside, it can still be recovered by hand.
    static func load<T: Decodable>(_ type: T.Type, from filename: String) -> T? {
        let url = fileURL(filename)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(type, from: data)
        } catch {
            print("Vectis: failed to load \(filename) — \(error)")
            setAside(url)
            return nil
        }
    }

    /// Renames an unreadable file to e.g.
    /// `goals.unreadable-2026-10-03-091500.json`, next to where it was.
    private static func setAside(_ url: URL) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        let stamp = formatter.string(from: Date())
        let name = "\(url.deletingPathExtension().lastPathComponent).unreadable-\(stamp).\(url.pathExtension)"
        let destination = url.deletingLastPathComponent().appendingPathComponent(name)
        do {
            try FileManager.default.moveItem(at: url, to: destination)
            print("Vectis: kept unreadable file as \(name)")
        } catch {
            print("Vectis: couldn't set aside \(url.lastPathComponent) — \(error)")
        }
    }

    /// Removes a saved file. Used for transient state like a pending
    /// launch, which should genuinely go away once resolved rather than
    /// lingering as a stale file.
    static func delete(_ filename: String) {
        try? FileManager.default.removeItem(at: fileURL(filename))
    }

    // Filenames kept in one place so a typo can't cause a store to
    // silently save to one file and load from another.
    enum Filename {
        static let goals = "goals.json"
        static let calendarEvents = "calendar_events.json"
        static let categories = "categories.json"
        static let calendarHours = "calendar_hours.json"
        static let notes = "notes.json"
        static let notebooks = "notebooks.json"
        static let appearance = "appearance.json"
        static let tasks = "tasks.json"
        static let customApps = "custom_apps.json"
        static let pendingLaunch = "pending_launch.json"
        static let people = "people.json"
        static let birthdayPrefs = "birthday_prefs.json"
        static let journalEntries = "journal_entries.json"
        static let planReviewSettings = "plan_review_settings.json"
    }
}

/// The daily calendar's visible hour range — small enough that it'd be
/// silly as its own file, but it needs to be Codable to save alongside
/// everything else.
struct CalendarHours: Codable {
    var startHour: Int
    var endHour: Int
}

/// Appearance preferences in savable form. AppearanceStore itself holds
/// published properties SwiftUI watches; this is the plain snapshot of
/// them that gets written to disk.
struct AppearanceSettings: Codable {
    var mode: String
    var selectedPresetID: String
    var isCustom: Bool
    var customPrimaryHex: String
    var customSecondaryHex: String
    var customTertiaryHex: String
}

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension CalendarHours {
    enum CodingKeys: String, CodingKey {
        case startHour, endHour
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startHour = try c.decodeIfPresent(Int.self, forKey: .startHour) ?? 6
        endHour = try c.decodeIfPresent(Int.self, forKey: .endHour) ?? 24
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(startHour, forKey: .startHour)
        try c.encode(endHour, forKey: .endHour)
    }
}

extension AppearanceSettings {
    enum CodingKeys: String, CodingKey {
        case mode, selectedPresetID, isCustom, customPrimaryHex, customSecondaryHex, customTertiaryHex
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mode = try c.decodeIfPresent(String.self, forKey: .mode) ?? "system"
        selectedPresetID = try c.decodeIfPresent(String.self, forKey: .selectedPresetID) ?? "tealCoral"
        isCustom = try c.decodeIfPresent(Bool.self, forKey: .isCustom) ?? false
        customPrimaryHex = try c.decodeIfPresent(String.self, forKey: .customPrimaryHex) ?? "0068B5"
        customSecondaryHex = try c.decodeIfPresent(String.self, forKey: .customSecondaryHex) ?? "D2574A"
        customTertiaryHex = try c.decodeIfPresent(String.self, forKey: .customTertiaryHex) ?? "C9922E"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(mode, forKey: .mode)
        try c.encode(selectedPresetID, forKey: .selectedPresetID)
        try c.encode(isCustom, forKey: .isCustom)
        try c.encode(customPrimaryHex, forKey: .customPrimaryHex)
        try c.encode(customSecondaryHex, forKey: .customSecondaryHex)
        try c.encode(customTertiaryHex, forKey: .customTertiaryHex)
    }
}
