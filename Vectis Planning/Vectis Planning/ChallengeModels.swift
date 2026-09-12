import Foundation

/// One task within a challenge template, e.g. "Drink a gallon of water".
struct ChallengeTask: Codable, Identifiable, Hashable {
    var title: String
    var suggestedTime: String?

    // Templates come from JSON without IDs, so derive a stable one from
    // the title — enough to tell tasks apart within a single challenge.
    var id: String { title }
}

/// A challenge template as it exists in Challenges.json — the blueprint,
/// not something you're currently doing. Starting one turns it into a
/// real long-term goal with linked daily habits.
struct ChallengeTemplate: Codable, Identifiable {
    var id: String
    var name: String
    var tagline: String
    var description: String
    var durationDays: Int
    var supportsStrictMode: Bool
    var strictModeDisclaimer: String?
    var tasks: [ChallengeTask]
}

/// Loads the challenge catalog from the bundled JSON file.
///
/// Kept as a separate file rather than hardcoded Swift so you can add
/// or edit challenges by editing plain text — same reasoning as the
/// linked apps catalog.
enum ChallengeCatalog {
    static func load() -> [ChallengeTemplate] {
        guard let url = Bundle.main.url(forResource: "Challenges", withExtension: "json") else {
            print("Vectis: Challenges.json not found in bundle")
            return []
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([ChallengeTemplate].self, from: data)
        } catch {
            print("Vectis: failed to decode Challenges.json — \(error)")
            return []
        }
    }
}
