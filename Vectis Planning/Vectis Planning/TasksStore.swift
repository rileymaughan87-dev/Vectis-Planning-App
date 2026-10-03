import Foundation
import Combine

/// A one-off thing to do. Deliberately minimal — no due date, no
/// recurrence, no streak tracking.
///
/// That simplicity is the point. Vectis already has two systems for
/// "things I should do": goals (recurring, tracked) and calendar events
/// (scheduled to a time). Tasks fill the remaining gap — "email the
/// landlord", "buy milk" — things with no schedule and no streak. The
/// moment a task grows a due date or a repeat rule, it stops being
/// distinct from a goal and the app has two things doing one job.
struct VectisTask: Identifiable, Codable {
    var id: UUID = UUID()
    var text: String
    var done: Bool = false
    var createdDate: Date = Date()

    /// Optional — a task with no duration stays a plain checklist item.
    /// One with a duration can be placed on the Daily grid during
    /// morning planning. This doesn't make a task a due date or a
    /// recurring thing; it stays undated and one-off either way.
    var durationMinutes: Int? = nil

    /// The exact day and time this task was dragged onto the grid.
    /// `nil` means it's unplaced — still just a checklist item, or
    /// sitting in the planning tray waiting for a spot. Setting this is
    /// the only thing that makes a task show up on the Daily calendar.
    var scheduledDate: Date? = nil

    // MARK: - Codable
    //
    // Hand-written rather than left to Swift's automatic synthesis —
    // same reasoning as Goal and CalendarEvent. Swift's synthesized
    // decoder doesn't fall back to a default value for a key missing
    // from old saved JSON; it fails the whole object, which would have
    // silently wiped every saved task the moment durationMinutes was
    // added if this struct had been left on automatic Codable.
    enum CodingKeys: String, CodingKey {
        case id, text, done, createdDate, durationMinutes, scheduledDate
    }

    init(
        id: UUID = UUID(),
        text: String,
        done: Bool = false,
        createdDate: Date = Date(),
        durationMinutes: Int? = nil,
        scheduledDate: Date? = nil
    ) {
        self.id = id
        self.text = text
        self.done = done
        self.createdDate = createdDate
        self.durationMinutes = durationMinutes
        self.scheduledDate = scheduledDate
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        text = try c.decode(String.self, forKey: .text)
        done = try c.decodeIfPresent(Bool.self, forKey: .done) ?? false
        createdDate = try c.decodeIfPresent(Date.self, forKey: .createdDate) ?? Date()
        durationMinutes = try c.decodeIfPresent(Int.self, forKey: .durationMinutes)
        scheduledDate = try c.decodeIfPresent(Date.self, forKey: .scheduledDate)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(text, forKey: .text)
        try c.encode(done, forKey: .done)
        try c.encode(createdDate, forKey: .createdDate)
        try c.encodeIfPresent(durationMinutes, forKey: .durationMinutes)
        try c.encodeIfPresent(scheduledDate, forKey: .scheduledDate)
    }
}

class TasksStore: ObservableObject {
    @Published var tasks: [VectisTask] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let saved = PersistenceManager.load([VectisTask].self, from: PersistenceManager.Filename.tasks) {
            tasks = saved
        }

        $tasks
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.tasks) }
            .store(in: &cancellables)
    }

    /// Incomplete first, then completed — matching how they display,
    /// so finished items sink to the bottom rather than leaving gaps
    /// in the middle of the list.
    var sortedTasks: [VectisTask] {
        tasks.sorted { a, b in
            if a.done != b.done { return !a.done }
            return a.createdDate < b.createdDate
        }
    }

    var incompleteCount: Int {
        tasks.filter { !$0.done }.count
    }

    func addTask(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        tasks.append(VectisTask(text: trimmed))
    }

    func toggle(_ id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].done.toggle()
    }

    func updateText(_ id: UUID, text: String) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].text = text
    }

    /// Sets or clears a task's duration. `nil` puts it back to being a
    /// plain checklist item with nothing to place on the calendar.
    /// Drags a task onto the Daily grid at a specific moment — the only
    /// thing that makes it show up there. Doesn't touch `done` or
    /// anything else; placing is about when, not whether it's finished.
    func place(_ id: UUID, at date: Date) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].scheduledDate = date
    }

    /// Drops it back into the tray — a plain checklist item again until
    /// placed somewhere new.
    func unplace(_ id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].scheduledDate = nil
    }

    func setDuration(_ id: UUID, minutes: Int?) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].durationMinutes = minutes
    }

    func delete(_ id: UUID) {
        tasks.removeAll { $0.id == id }
    }

    /// Clears out completed tasks. Not automatic — you might want to
    /// see what you got done today before wiping the slate.
    func clearCompleted() {
        tasks.removeAll { $0.done }
    }
}

