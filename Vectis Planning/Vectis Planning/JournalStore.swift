import Foundation
import Combine

/// One dated entry — the evening review's written reflection and a
/// standalone journal are the same underlying thing, not two features.
/// Answering the review's prompt starts the entry for that day; writing
/// freeform from Record adds to or creates that same entry. Never two
/// records for one day that could drift apart.
///
/// Codable written by hand from the start rather than left to Swift's
/// automatic synthesis — the lesson from `Goal` and `CalendarEvent`
/// applied up front this time instead of retrofitted after a field
/// addition silently breaks old saved data.
struct JournalEntry: Identifiable, Codable {
    var id: UUID = UUID()

    /// The day this entry is FOR, not necessarily when it was written.
    var date: Date

    /// Set only if this entry was seeded by the evening review's
    /// prompt. Purely informational — shown as a small tag, not a
    /// status the app treats differently.
    var reflectionPrompt: String? = nil

    var text: String = ""

    enum CodingKeys: String, CodingKey {
        case id, date, reflectionPrompt, text
    }

    init(id: UUID = UUID(), date: Date, reflectionPrompt: String? = nil, text: String = "") {
        self.id = id
        self.date = date
        self.reflectionPrompt = reflectionPrompt
        self.text = text
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        date = try c.decode(Date.self, forKey: .date)
        reflectionPrompt = try c.decodeIfPresent(String.self, forKey: .reflectionPrompt)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(date, forKey: .date)
        try c.encodeIfPresent(reflectionPrompt, forKey: .reflectionPrompt)
        try c.encode(text, forKey: .text)
    }
}

class JournalStore: ObservableObject {
    @Published var entries: [JournalEntry] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let saved = PersistenceManager.load([JournalEntry].self, from: PersistenceManager.Filename.journalEntries) {
            entries = saved
        }

        $entries
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.journalEntries) }
            .store(in: &cancellables)
    }

    func entry(for date: Date) -> JournalEntry? {
        let calendar = Calendar.current
        return entries.first { calendar.isDate($0.date, inSameDayAs: date) }
    }

    /// What the evening review calls. If today already has an entry
    /// this only attaches the prompt — it never overwrites text someone
    /// already wrote, in either direction.
    func seedReflection(date: Date, prompt: String) {
        let calendar = Calendar.current
        if let index = entries.firstIndex(where: { calendar.isDate($0.date, inSameDayAs: date) }) {
            if entries[index].reflectionPrompt == nil {
                entries[index].reflectionPrompt = prompt
            }
        } else {
            entries.append(JournalEntry(date: calendar.startOfDay(for: date), reflectionPrompt: prompt))
        }
    }

    /// The freeform write path — also what saves a review's answer,
    /// since answering the prompt and writing more are the same action
    /// on the same entry.
    func setText(date: Date, text: String) {
        let calendar = Calendar.current
        if let index = entries.firstIndex(where: { calendar.isDate($0.date, inSameDayAs: date) }) {
            entries[index].text = text
        } else {
            entries.append(JournalEntry(date: calendar.startOfDay(for: date), text: text))
        }
    }

    func delete(_ id: UUID) {
        entries.removeAll { $0.id == id }
    }

    /// Newest first — entries with genuinely empty text and no prompt
    /// answered don't count as real entries, so they're filtered out
    /// rather than showing as blank rows.
    var sortedEntries: [JournalEntry] {
        entries
            .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { $0.date > $1.date }
    }

    /// Grouped by month, newest month first, entries within each month
    /// newest first — what the list view renders directly.
    var groupedByMonth: [(month: String, entries: [JournalEntry])] {
        let formatter = DateFormatter()
        formatter.dateFormat = "LLLL yyyy"

        var order: [String] = []
        var buckets: [String: [JournalEntry]] = [:]
        for entry in sortedEntries {
            let key = formatter.string(from: entry.date)
            if buckets[key] == nil {
                buckets[key] = []
                order.append(key)
            }
            buckets[key]!.append(entry)
        }
        return order.map { (month: $0, entries: buckets[$0] ?? []) }
    }

    func matches(_ entry: JournalEntry, query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return true }
        if entry.text.lowercased().contains(q) { return true }
        if let prompt = entry.reflectionPrompt, prompt.lowercased().contains(q) { return true }
        return false
    }
}
