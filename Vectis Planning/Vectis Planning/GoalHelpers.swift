import Foundation

// This file adds computed properties onto the model types from
// CalendarModels.swift, using Swift's `extension` feature. Extensions
// let you add functionality to a type from anywhere in your project —
// here, it keeps CalendarModels.swift focused on plain data, while all
// the "how do I turn this data into something displayable" logic for
// Goals lives in one place.

extension Goal {
    /// A calendar block for this goal on a given day, or nil if it isn't
    /// scheduled to the calendar or isn't due that day.
    ///
    /// The returned event is transient — built fresh each time a day is
    /// drawn and never saved. `linkedGoalID` points back here so the
    /// planner knows it's goal-derived and can let you tick it off
    /// directly rather than treating it as an editable event.
    func scheduledBlock(on date: Date, categoryID: UUID) -> CalendarEvent? {
        guard scheduledOnCalendar, isScheduled(on: date) else { return nil }

        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: date)
        // A day that's been individually dragged uses its own time
        // instead of the goal's normal schedule — this is what makes
        // moving one occurrence NOT move every day.
        let effectiveStartMinutes = scheduledTimeOverrides[Goal.dayKey(date)] ?? scheduledStartMinutes
        let start = dayStart.addingTimeInterval(TimeInterval(effectiveStartMinutes * 60))
        let end = start.addingTimeInterval(TimeInterval(max(scheduledDurationMinutes, 5) * 60))

        var event = CalendarEvent(
            title: title,
            startDate: start,
            endDate: end,
            categoryID: categoryID,
            flowsToDaily: true
        )
        // A STABLE id derived from the goal and the day, not a fresh
        // random one. This block gets rebuilt from scratch on every
        // redraw of the Daily grid — including continuously while
        // dragging it, since dragging updates state on every finger
        // movement. A random id meant the block you were mid-drag on
        // stopped existing (by identity) a moment after you touched it,
        // which is what was breaking dragging: SwiftUI lost track of
        // which view the gesture belonged to. Deriving the id from
        // (goal, day) instead means it stays the same across redraws,
        // and only changes if the goal or day actually changes.
        event.id = Goal.stableBlockID(goalID: id, dayKey: Goal.dayKey(date))
        event.linkedGoalID = id
        event.isCompleted = completions[Goal.dayKey(date)] == true
        return event
    }

    /// A UUID that's stable for a given (goal, day) pair for as long as
    /// the app keeps running — not necessarily stable across separate
    /// launches, which doesn't matter here since these blocks are
    /// transient and never saved to disk; they're rebuilt fresh every
    /// time a day is drawn regardless.
    static func stableBlockID(goalID: UUID, dayKey: String) -> UUID {
        var hasher = Hasher()
        hasher.combine(goalID)
        hasher.combine(dayKey)
        let first = UInt64(bitPattern: Int64(hasher.finalize()))
        hasher.combine("vectis-block-salt")
        let second = UInt64(bitPattern: Int64(hasher.finalize()))
        let bytes = withUnsafeBytes(of: first.bigEndian) { Array($0) }
            + withUnsafeBytes(of: second.bigEndian) { Array($0) }
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    /// Formatted time range for showing in the goal editor.
    var scheduledTimeText: String {
        func label(_ minutes: Int) -> String {
            let hour24 = (minutes / 60) % 24
            let minute = minutes % 60
            let period = hour24 < 12 ? "AM" : "PM"
            var hour12 = hour24 % 12
            if hour12 == 0 { hour12 = 12 }
            return minute == 0 ? "\(hour12) \(period)" : String(format: "%d:%02d %@", hour12, minute, period)
        }
        return "\(label(scheduledStartMinutes)) – \(label(scheduledStartMinutes + scheduledDurationMinutes))"
    }

    /// Whether this goal is scheduled to happen on a given date.
    ///
    /// Only `.specificDays` actually cares which weekday it is — the
    /// other two are available every day (subject to `endDate`), since
    /// "3 times this week" or "4 times today" aren't tied to a
    /// particular day at all.
    func isScheduled(on date: Date) -> Bool {
        let calendar = Calendar.current
        if let endDate {
            let day = calendar.startOfDay(for: date)
            let end = calendar.startOfDay(for: endDate)
            if day > end { return false }
        }
        switch frequencyType {
        case .specificDays:
            let weekday = calendar.component(.weekday, from: date)
            return repeatDays.contains(weekday)
        case .timesPerWeek, .timesPerDay:
            return true
        }
    }

    var isScheduledToday: Bool {
        isScheduled(on: Date())
    }

    /// How many times a `.timesPerDay` goal has been done on a given day.
    func completionCount(on date: Date) -> Int {
        completionCounts[Goal.dayKey(date)] ?? 0
    }

    var todayCompletionCount: Int {
        completionCount(on: Date())
    }

    /// How many days within the CURRENT week a `.timesPerWeek` goal has
    /// been marked done. "Current week" follows the same week-start
    /// convention as the device's calendar, so it lines up with what
    /// the user would expect a "week" to mean.
    func weeklyCompletionCount(asOf date: Date = Date()) -> Int {
        let calendar = Calendar.current
        guard let week = calendar.dateInterval(of: .weekOfYear, for: date) else { return 0 }
        var count = 0
        var cursor = week.start
        while cursor < week.end {
            if completions[Goal.dayKey(cursor)] == true { count += 1 }
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return count
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
    /// Only meaningful for `.specificDays` goals — the other two types
    /// don't have a per-day pass/fail concept to show dots for.
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

    /// Whether today counts as "done", by whichever definition this
    /// goal's frequency type uses.
    var isCompletedToday: Bool {
        switch frequencyType {
        case .specificDays, .timesPerWeek:
            return completions[Goal.dayKey(Date())] ?? false
        case .timesPerDay:
            return todayCompletionCount >= timesPerDayTarget
        }
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

