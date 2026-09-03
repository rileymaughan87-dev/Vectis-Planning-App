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

    func delete(_ id: UUID) {
        tasks.removeAll { $0.id == id }
    }

    /// Clears out completed tasks. Not automatic — you might want to
    /// see what you got done today before wiping the slate.
    func clearCompleted() {
        tasks.removeAll { $0.done }
    }
}
