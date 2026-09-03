import Foundation

// This file adds computed properties onto the model types from
// CalendarModels.swift, using Swift's `extension` feature. Extensions
// let you add functionality to a type from anywhere in your project —
// here, it keeps CalendarModels.swift focused on plain data, while all
// the "how do I turn this data into something displayable" logic for
// Goals lives in one place.

extension Goal {
    /// Whether this goal is scheduled to happen on a given date, based
    /// on `repeatDays` and, if set, `endDate`. A goal set to weekdays
    /// only, or one whose 2-month run has finished, simply isn't "due"
    /// on days outside that window — there's nothing to tick off or miss.
    func isScheduled(on date: Date) -> Bool {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        guard repeatDays.contains(weekday) else { return false }
        if let endDate = endDate {
            let day = calendar.startOfDay(for: date)
            let end = calendar.startOfDay(for: endDate)
            if day > end { return false }
        }
        return true
    }

    var isScheduledToday: Bool {
        isScheduled(on: Date())
    }

    /// True only for a milestone-based long-term goal that has a target
    /// date in the past with milestones still left to finish. Note-based
    /// goals have no clear "done" state, so they're never flagged overdue.
    var isTargetOverdue: Bool {
        guard let targetDate = targetDate, !milestones.isEmpty else { return false }
        let allDone = milestones.allSatisfy { $0.done }
        return !allDone && targetDate < Calendar.current.startOfDay(for: Date())
    }

    /// The last 7 days of history, oldest first, for drawing streak dots.
    /// Each entry is `true` (done), `false` (missed), or `nil` — which
    /// now covers both "no record yet" *and* "not scheduled that day",
    /// since neither should count for or against the streak.
    func last7DaysHistory() -> [Bool?] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        return (0..<7).reversed().map { offset in
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else {
                return nil
            }
            guard isScheduled(on: day) else { return nil }
            return completions[Goal.dayKey(day)]
        }
    }

    /// Percent of *known* days completed. Days with no record at all are
    /// ignored rather than counted as misses, so a brand-new goal doesn't
    /// start at 0%.
    var completionPercentage: Int {
        let known = completions.values
        guard !known.isEmpty else { return 0 }
        let doneCount = known.filter { $0 }.count
        return Int((Double(doneCount) / Double(known.count) * 100).rounded())
    }

    var isCompletedToday: Bool {
        completions[Goal.dayKey(Date())] ?? false
    }
}

extension Milestone {
    /// True only if the milestone has a calendar date in the past,
    /// isn't done, and was actually scheduled in the first place.
    var isOverdue: Bool {
        guard addToCalendar, let date = date, !done else { return false }
        return date < Calendar.current.startOfDay(for: Date())
    }
}

extension Array where Element == Milestone {
    /// Percent of milestones marked done — this is what drives a
    /// long-term goal's progress bar when it has milestones at all.
    var completionPercentage: Int {
        guard !isEmpty else { return 0 }
        let doneCount = filter { $0.done }.count
        return Int((Double(doneCount) / Double(count) * 100).rounded())
    }
}

