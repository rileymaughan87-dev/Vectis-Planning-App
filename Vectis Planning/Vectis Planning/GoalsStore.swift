import Foundation
import Combine

/// Holds every goal in the app and the logic to read and update them.
///
/// This is an `ObservableObject` — a class SwiftUI actively watches.
/// Any View reading a `@Published` property here automatically redraws
/// itself the moment that property changes. It's similar to a Redux or
/// Pinia store if you've used those in web development: one shared
/// source of truth that multiple screens can read from and write to,
/// so ticking a habit off in one place (like the Daily calendar) will
/// instantly update it everywhere else too.
///
/// Data is saved to disk automatically — see the `$goals.sink` in init
/// below, which watches for any change and writes the file. That's less
/// error-prone than remembering to call save() in every method that
/// mutates something.
class GoalsStore: ObservableObject {
    @Published var goals: [Goal] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Load saved goals if they exist; fall back to samples only on
        // a genuine first launch, so returning users don't get sample
        // data mixed into their real goals.
        if let saved = PersistenceManager.load([Goal].self, from: PersistenceManager.Filename.goals) {
            goals = saved
        } else {
            goals = GoalsStore.sampleGoals()
        }

        // `dropFirst()` skips the value that's already there from the
        // line above, so loading doesn't immediately trigger a pointless
        // save of what we just read.
        $goals
            .dropFirst()
            .sink { updated in
                PersistenceManager.save(updated, to: PersistenceManager.Filename.goals)
            }
            .store(in: &cancellables)
    }

    // MARK: - Derived lists

    /// Short-term goals that aren't tied to a long-term goal — the ones
    /// that show up at the top level of the Short-term section.
    var standaloneShortTermGoals: [Goal] {
        goals.filter { $0.kind == .shortTerm && $0.linkedToGoalID == nil }
    }

    var longTermGoals: [Goal] {
        goals.filter { $0.kind == .longTerm }
    }

    /// The daily habits linked to a specific long-term goal, e.g.
    /// "Study 1 hour" nested under "Finish degree".
    func linkedGoals(for longTermGoalID: UUID) -> [Goal] {
        goals.filter { $0.linkedToGoalID == longTermGoalID }
    }

    // MARK: - Mutating actions

    /// Marks a short-term goal done or not-done for today specifically.
    func setToday(_ goalID: UUID, done: Bool) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        goals[index].completions[Goal.dayKey(Date())] = done
    }

    func addShortTermGoal(title: String, linkedTo: UUID? = nil, repeatDays: Set<Int> = Goal.allDays, endDate: Date? = nil) {
        var goal = Goal(title: title)
        goal.kind = .shortTerm
        goal.frequency = .daily
        goal.linkedToGoalID = linkedTo
        goal.repeatDays = repeatDays
        goal.endDate = endDate
        goals.append(goal)
    }

    /// Inserts an already-built goal (name, milestones, target date and
    /// all) directly into the store. Used when finishing the single-screen
    /// creation flow, where everything was already filled in locally
    /// before you tapped Create.
    func addLongTermGoal(_ goal: Goal) {
        var newGoal = goal
        newGoal.kind = .longTerm
        goals.append(newGoal)
    }

    /// Overwrites any existing goal — short-term or long-term — with an
    /// edited copy. Used after either editor sheet is saved.
    func updateGoal(_ updated: Goal) {
        guard let index = goals.firstIndex(where: { $0.id == updated.id }) else { return }
        goals[index] = updated
    }

    /// Removes a long-term goal AND any short-term habits linked to it.
    /// Used specifically when someone cancels right after *creating* a
    /// new goal, before they've actually confirmed it — so nothing gets
    /// left behind orphaned. Editing an existing goal and cancelling
    /// never calls this; it just discards the unsaved edits instead.
    func discardLongTermGoal(_ id: UUID) {
        goals.removeAll { $0.id == id || $0.linkedToGoalID == id }
    }

    /// Ticks a milestone off directly from the goal card, without
    /// needing to open the editor.
    func toggleMilestone(goalID: UUID, milestoneID: UUID) {
        guard let goalIndex = goals.firstIndex(where: { $0.id == goalID }),
              let milestoneIndex = goals[goalIndex].milestones.firstIndex(where: { $0.id == milestoneID })
        else { return }
        goals[goalIndex].milestones[milestoneIndex].done.toggle()
    }

    func addNote(to goalID: UUID, text: String) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        goals[index].notes.append(GoalNote(text: text))
    }

    // MARK: - Sample data

    /// A few starter goals so the page isn't empty on first run. Delete
    /// this once real data persistence is in place.
    static func sampleGoals() -> [Goal] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        var readGoal = Goal(title: "Read for 30 min")
        readGoal.kind = .shortTerm
        readGoal.frequency = .daily
        readGoal.endDate = calendar.date(byAdding: .month, value: 2, to: today)
        for offset in 1...6 {
            if let day = calendar.date(byAdding: .day, value: -offset, to: today) {
                readGoal.completions[Goal.dayKey(day)] = offset % 3 != 0
            }
        }

        var degreeGoal = Goal(title: "Finish degree")
        degreeGoal.kind = .longTerm
        degreeGoal.targetDate = DateComponents(calendar: calendar, year: 2027, month: 8, day: 1).date
        degreeGoal.milestones = [
            Milestone(
                title: "Submit thesis proposal",
                done: true,
                addToCalendar: true,
                date: calendar.date(byAdding: .day, value: -10, to: today)
            ),
            Milestone(
                title: "Pass finals",
                done: false,
                addToCalendar: true,
                date: calendar.date(byAdding: .day, value: -2, to: today)
            ),
            Milestone(
                title: "Graduation ceremony",
                done: false,
                addToCalendar: true,
                date: calendar.date(byAdding: .day, value: 90, to: today)
            )
        ]

        var studyGoal = Goal(title: "Study 1 hour")
        studyGoal.kind = .shortTerm
        studyGoal.frequency = .daily
        studyGoal.linkedToGoalID = degreeGoal.id
        studyGoal.repeatDays = Goal.weekdaysOnly

        var healthGoal = Goal(title: "Eat healthier")
        healthGoal.kind = .longTerm
        healthGoal.notes = [
            GoalNote(date: calendar.date(byAdding: .day, value: -6, to: today) ?? today, text: "Started meal prepping"),
            GoalNote(date: calendar.date(byAdding: .day, value: -1, to: today) ?? today, text: "Cut out soda")
        ]

        return [readGoal, degreeGoal, studyGoal, healthGoal]
    }
}

