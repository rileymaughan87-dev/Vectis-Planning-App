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

    /// Turns a challenge template into a real long-term goal with one
    /// linked daily habit per selected task.
    ///
    /// Nothing about the result is special-cased — it's an ordinary goal
    /// with ordinary habits, which is why you can edit or delete any
    /// part of it afterwards exactly like anything else you made.
    @discardableResult
    func startChallenge(
        _ template: ChallengeTemplate,
        selectedTasks: [ChallengeTask],
        startDate: Date,
        strictMode: Bool
    ) -> Goal {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: startDate)
        let end = calendar.date(byAdding: .day, value: template.durationDays - 1, to: start) ?? start

        var goal = Goal(title: template.name)
        goal.kind = .longTerm
        goal.targetDate = end
        goal.challengeTemplateID = template.id
        goal.challengeStartDate = start
        goal.challengeStrictMode = strictMode
        goal.milestones = [
            Milestone(
                title: "\(template.name) complete (day \(template.durationDays))",
                done: false,
                addToCalendar: true,
                date: end
            )
        ]
        goals.append(goal)

        for task in selectedTasks {
            var habit = Goal(title: task.title)
            habit.kind = .shortTerm
            habit.frequency = .daily
            habit.linkedToGoalID = goal.id
            habit.endDate = end
            goals.append(habit)
        }

        return goal
    }

    /// Wipes the current attempt's completion history and restarts from
    /// today, bumping the attempt count. Used when a strict-mode
    /// challenge has a reported miss.
    func restartChallenge(_ goalID: UUID) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }),
              let templateID = goals[index].challengeTemplateID,
              let template = ChallengeCatalog.load().first(where: { $0.id == templateID })
        else { return }

        let calendar = Calendar.current
        let start = calendar.startOfDay(for: Date())
        let end = calendar.date(byAdding: .day, value: template.durationDays - 1, to: start) ?? start

        goals[index].challengeStartDate = start
        goals[index].targetDate = end
        goals[index].challengeAttempt += 1
        for milestoneIndex in goals[index].milestones.indices {
            goals[index].milestones[milestoneIndex].done = false
            goals[index].milestones[milestoneIndex].date = end
        }

        // Clear the linked habits' history too — a restart means day one.
        for habitIndex in goals.indices where goals[habitIndex].linkedToGoalID == goalID {
            goals[habitIndex].completions = [:]
            goals[habitIndex].endDate = end
        }
    }

    /// Long-term goals that came from a challenge template.
    var activeChallenges: [Goal] {
        goals.filter { $0.challengeTemplateID != nil }
    }

    /// Which day of the challenge today is, 1-based.
    func challengeDay(for goal: Goal, on date: Date = Date()) -> Int? {
        guard let start = goal.challengeStartDate else { return nil }
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: date)).day ?? 0
        return days + 1
    }

    /// Past days within a challenge that have no record either way for
    /// at least one of its habits — days you were away and never
    /// confirmed. These drive the catch-up prompt rather than being
    /// silently counted as failures.
    func unresolvedDays(for goal: Goal, upTo date: Date = Date()) -> [Date] {
        guard let start = goal.challengeStartDate else { return [] }
        let calendar = Calendar.current
        let habits = linkedGoals(for: goal.id)
        guard !habits.isEmpty else { return [] }

        var result: [Date] = []
        var cursor = calendar.startOfDay(for: start)
        let today = calendar.startOfDay(for: date)

        while cursor < today {
            let key = Goal.dayKey(cursor)
            let anyUnrecorded = habits.contains { $0.completions[key] == nil }
            if anyUnrecorded { result.append(cursor) }
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return result
    }

    /// Marks every habit of a challenge done (or missed) for one day.
    func resolveDay(_ goal: Goal, date: Date, completed: Bool) {
        let key = Goal.dayKey(date)
        for index in goals.indices where goals[index].linkedToGoalID == goal.id {
            goals[index].completions[key] = completed
        }
    }

    /// Deletes a goal. For a long-term goal this also removes any daily
    /// habits linked to it — leaving them behind would orphan them,
    /// since they'd point at a parent that no longer exists and would
    /// stop appearing anywhere in the UI.
    func deleteGoal(_ id: UUID) {
        goals.removeAll { $0.id == id || $0.linkedToGoalID == id }
    }

    /// Increments today's count for a `.timesPerDay` goal, capped at its
    /// target. Also mirrors the result into `completions` so anything
    /// reading that dictionary (streak-style helpers, the catch-up flow)
    /// still sees a sensible true/false for the day.
    func incrementTodayCount(_ goalID: UUID) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        let key = Goal.dayKey(Date())
        let target = goals[index].timesPerDayTarget
        let current = goals[index].completionCounts[key] ?? 0
        let updated = min(current + 1, target)
        goals[index].completionCounts[key] = updated
        goals[index].completions[key] = updated >= target
    }

    func decrementTodayCount(_ goalID: UUID) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        let key = Goal.dayKey(Date())
        let target = goals[index].timesPerDayTarget
        let current = goals[index].completionCounts[key] ?? 0
        let updated = max(current - 1, 0)
        goals[index].completionCounts[key] = updated
        goals[index].completions[key] = updated >= target
    }

    /// Shifts a goal's scheduled calendar time by a number of minutes —
    /// what dragging a goal-generated block on the Daily planner calls.
    ///
    /// A goal only has ONE scheduled time, not one per day, so moving
    /// one occurrence moves the whole series — the same thing we do for
    /// repeating calendar events, for the same reason: there's nothing
    /// else it could sensibly mean.
    /// Changes the goal's DEFAULT scheduled time — what editing the time
    /// in the goal editor calls. This is the "change it going forward"
    /// action: it affects every day that doesn't already have its own
    /// override from `setScheduledTimeOverride`, which keeps whatever
    /// day-specific adjustment it was given.
    func shiftScheduledTime(_ goalID: UUID, byMinutes delta: Int) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        let newStart = goals[index].scheduledStartMinutes + delta
        goals[index].scheduledStartMinutes = min(max(newStart, 0), 23 * 60 + 30)
    }

    /// Sets the scheduled time for ONE specific day only — what
    /// dragging a single occurrence on the Daily planner calls. The
    /// goal's overall schedule (and every other day) is untouched.
    func setScheduledTimeOverride(_ goalID: UUID, date: Date, startMinutes: Int) {
        guard let index = goals.firstIndex(where: { $0.id == goalID }) else { return }
        let clamped = min(max(startMinutes, 0), 23 * 60 + 30)
        goals[index].scheduledTimeOverrides[Goal.dayKey(date)] = clamped
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

