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
            return nil
        }
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
        static let financeEvents = "finance_events.json"
        static let appearance = "appearance.json"
        static let tasks = "tasks.json"
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

