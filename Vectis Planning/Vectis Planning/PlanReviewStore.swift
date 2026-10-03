import Foundation
import Combine

/// Settings for Plan and Review mode. A small dedicated store rather
/// than folding into `CalendarStore` or `GoalsStore` — this is
/// cross-cutting app behavior, not calendar or goal data, matching how
/// `AppearanceStore` is its own store for the same reason.
class PlanReviewStore: ObservableObject {
    @Published var isEnabled: Bool = false

    // Sub-toggles — plain language in the UI, not research jargon. Not
    // everything gets a toggle: forgiving a single missed day, for
    // example, is just a default for everyone, not opt-in here.
    @Published var reviewTimeEstimates: Bool = true
    @Published var rehearsePlans: Bool = true
    @Published var flagRepeatedMisses: Bool = true
    @Published var freshStartPrompts: Bool = true

    // Minutes from midnight. No opinion baked in about which is
    // better — the evidence for morning vs. evening planning timing
    // doesn't hold up, so this stays a plain preference.
    @Published var eveningReviewMinutes: Int = 20 * 60 + 30 // 8:30pm

    private var cancellables = Set<AnyCancellable>()

    fileprivate struct SavedSettings: Codable {
        var isEnabled: Bool
        var reviewTimeEstimates: Bool
        var rehearsePlans: Bool
        var flagRepeatedMisses: Bool
        var freshStartPrompts: Bool
        var eveningReviewMinutes: Int
    }

    init() {
        if let saved = PersistenceManager.load(SavedSettings.self, from: PersistenceManager.Filename.planReviewSettings) {
            isEnabled = saved.isEnabled
            reviewTimeEstimates = saved.reviewTimeEstimates
            rehearsePlans = saved.rehearsePlans
            flagRepeatedMisses = saved.flagRepeatedMisses
            freshStartPrompts = saved.freshStartPrompts
            eveningReviewMinutes = saved.eveningReviewMinutes
        }

        Publishers.CombineLatest4($isEnabled, $reviewTimeEstimates, $rehearsePlans, $flagRepeatedMisses)
            .combineLatest($freshStartPrompts, $eveningReviewMinutes)
            .dropFirst()
            .sink { [weak self] combined, freshStart, eveningMinutes in
                guard let self else { return }
                let (enabled, estimates, rehearse, flagMisses) = combined
                let settings = SavedSettings(
                    isEnabled: enabled,
                    reviewTimeEstimates: estimates,
                    rehearsePlans: rehearse,
                    flagRepeatedMisses: flagMisses,
                    freshStartPrompts: freshStart,
                    eveningReviewMinutes: eveningMinutes
                )
                PersistenceManager.save(settings, to: PersistenceManager.Filename.planReviewSettings)
            }
            .store(in: &cancellables)
    }

    /// Whether today's evening review has already been completed —
    /// checked against the journal rather than stored separately, since
    /// "did I review today" and "does today have a reflection" are the
    /// same question once the two features are the same underlying
    /// entry (see `JournalStore`).
    func hasReviewedToday(journalStore: JournalStore) -> Bool {
        guard let entry = journalStore.entry(for: Date()) else { return false }
        return entry.reflectionPrompt != nil
    }
}

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension PlanReviewStore.SavedSettings {
    enum CodingKeys: String, CodingKey {
        case isEnabled, reviewTimeEstimates, rehearsePlans, flagRepeatedMisses, freshStartPrompts, eveningReviewMinutes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isEnabled = try c.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? false
        reviewTimeEstimates = try c.decodeIfPresent(Bool.self, forKey: .reviewTimeEstimates) ?? true
        rehearsePlans = try c.decodeIfPresent(Bool.self, forKey: .rehearsePlans) ?? true
        flagRepeatedMisses = try c.decodeIfPresent(Bool.self, forKey: .flagRepeatedMisses) ?? true
        freshStartPrompts = try c.decodeIfPresent(Bool.self, forKey: .freshStartPrompts) ?? true
        eveningReviewMinutes = try c.decodeIfPresent(Int.self, forKey: .eveningReviewMinutes) ?? 20 * 60 + 30
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(isEnabled, forKey: .isEnabled)
        try c.encode(reviewTimeEstimates, forKey: .reviewTimeEstimates)
        try c.encode(rehearsePlans, forKey: .rehearsePlans)
        try c.encode(flagRepeatedMisses, forKey: .flagRepeatedMisses)
        try c.encode(freshStartPrompts, forKey: .freshStartPrompts)
        try c.encode(eveningReviewMinutes, forKey: .eveningReviewMinutes)
    }
}
