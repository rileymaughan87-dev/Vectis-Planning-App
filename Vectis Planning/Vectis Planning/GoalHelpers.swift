import Foundation

// This file adds computed properties onto the model types from
// CalendarModels.swift, using Swift's `extension` feature. Extensions
// let you add functionality to a type from anywhere in your project —
// here, it keeps CalendarModels.swift focused on plain data, while all
// the "how do I turn this data into something displayable" logic for
// Goals lives in one place.

/// What a single day in the history strip represents.
///
/// Replaces an earlier `Bool?`, which collapsed two different things
/// into `nil`: a day the goal wasn't scheduled, and a scheduled day with
/// no record. Both rendered near-invisible, so a goal with gaps looked
/// like it had almost no history — while `consecutiveMisses` was
/// counting those same days as misses. The two now agree.
enum GoalDayState {
    case done
    case missed
    case notScheduled
    case pending      // today or later, nothing to judge yet
}

/// One snapshot of a goal's schedule — repeat days, calendar start
/// time, and duration — bundled together rather than versioned
/// separately. A single edit always produces one consistent snapshot
/// this way; three independent histories could drift, leaving no good
/// answer for "what time was this on the day the days changed but the
/// time hadn't yet."
struct ScheduleVersion: Codable, Identifiable {
    var id: UUID = UUID()
    var effectiveFrom: Date
    var repeatDays: Set<Int>
    var startMinutes: Int
    var durationMinutes: Int
}

extension Goal {
    /// The repeat days, start time, and duration that were actually in
    /// effect on a given date.
    ///
    /// This is what makes the calendar a record rather than a
    /// projection: scroll back to before a schedule change and you see
    /// what you actually planned then, not today's settings applied
    /// backwards.
    struct ResolvedSchedule {
        var repeatDays: Set<Int>
        var startMinutes: Int
        var durationMinutes: Int
    }

    func schedule(on date: Date) -> ResolvedSchedule {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let live = ResolvedSchedule(
            repeatDays: repeatDays,
            startMinutes: scheduledStartMinutes,
            durationMinutes: scheduledDurationMinutes
        )

        // The live fields are correct for any date on or after when
        // they took effect — which covers every date for a goal whose
        // schedule has never changed, since that defaults to distantPast.
        if day >= calendar.startOfDay(for: currentScheduleEffectiveFrom) {
            return live
        }

        // Otherwise find the most recent superseded version whose
        // window had already started by this date.
        let match = scheduleVersions
            .filter { calendar.startOfDay(for: $0.effectiveFrom) <= day }
            .max { $0.effectiveFrom < $1.effectiveFrom }

        guard let match else {
            // No history reaches this far back — nothing to do but use
            // the live schedule rather than guess at something earlier.
            return live
        }
        return ResolvedSchedule(
            repeatDays: match.repeatDays,
            startMinutes: match.startMinutes,
            durationMinutes: match.durationMinutes
        )
    }

    /// Applies an edited schedule, recording the OLD one as history
    /// first if anything actually changed. Called once, at save time in
    /// the goal editor — not on every keystroke — so a version is only
    /// created for a change the person actually committed to.
    mutating func applyScheduleChange(
        repeatDays newRepeatDays: Set<Int>,
        startMinutes newStartMinutes: Int,
        durationMinutes newDurationMinutes: Int,
        effectiveFrom: Date = Date()
    ) {
        let changed = repeatDays != newRepeatDays
            || scheduledStartMinutes != newStartMinutes
            || scheduledDurationMinutes != newDurationMinutes
        guard changed else { return }

        scheduleVersions.append(ScheduleVersion(
            effectiveFrom: currentScheduleEffectiveFrom,
            repeatDays: repeatDays,
            startMinutes: scheduledStartMinutes,
            durationMinutes: scheduledDurationMinutes
        ))

        repeatDays = newRepeatDays
        scheduledStartMinutes = newStartMinutes
        scheduledDurationMinutes = newDurationMinutes
        currentScheduleEffectiveFrom = Calendar.current.startOfDay(for: effectiveFrom)
    }
    /// A calendar block for this goal on a given day, or nil if it isn't
    /// scheduled to the calendar or isn't due that day.
    ///
    /// The returned event is transient — built fresh each time a day is
    /// drawn and never saved. `linkedGoalID` points back here so the
    /// planner knows it's goal-derived and can let you tick it off
    /// directly rather than treating it as an editable event.
    func scheduledBlock(on date: Date, categoryID: UUID) -> CalendarEvent? {
        guard scheduledOnCalendar, isScheduled(on: date),
              !hiddenBlockDays.contains(Goal.dayKey(date)) else { return nil }

        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: date)
        // The resolved schedule for THIS date is the base — correct for
        // a past day even if the goal's time or duration has since
        // changed. A per-day drag override still wins over that, same
        // as before: that's a deliberate exception, not history.
        let resolved = schedule(on: date)
        let effectiveStartMinutes = scheduledTimeOverrides[Goal.dayKey(date)] ?? resolved.startMinutes
        let start = dayStart.addingTimeInterval(TimeInterval(effectiveStartMinutes * 60))
        let end = start.addingTimeInterval(TimeInterval(max(resolved.durationMinutes, 5) * 60))

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
    /// In the phone's own 12- or 24-hour style.
    var scheduledTimeText: String {
        let dayStart = Calendar.current.startOfDay(for: Date())
        func label(_ minutes: Int) -> String {
            dayStart.addingTimeInterval(TimeInterval(minutes * 60))
                .formatted(date: .omitted, time: .shortened)
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
        // Days before the goal existed aren't scheduled, so they can
        // never count as misses. Day keys are "yyyy-MM-dd", which sort
        // the same way as the dates they stand for.
        if Goal.dayKey(date) < firstDayKey { return false }
        if let endDate {
            let day = calendar.startOfDay(for: date)
            let end = calendar.startOfDay(for: endDate)
            if day > end { return false }
        }
        switch frequencyType {
        case .specificDays:
            let weekday = calendar.component(.weekday, from: date)
            // Resolved rather than the live repeatDays directly, so a
            // day before a schedule change is judged by the days that
            // actually applied then.
            return schedule(on: date).repeatDays.contains(weekday)
        case .timesPerWeek, .timesPerDay:
            return true
        }
    }

    /// The day this goal counts from: the day it was created, or the
    /// earliest day anything was logged for it, whichever came first.
    ///
    /// The logged days matter because goals saved before `createdDate`
    /// existed got "now" filled in when loaded. Their real history
    /// still has to count.
    var firstDayKey: String {
        let created = Goal.dayKey(createdDate)
        let earliestLogged = (Array(completions.keys) + Array(completionCounts.keys)).min()
        return min(created, earliestLogged ?? created)
    }

    /// The first day statistics count from: the goal's first day, or
    /// a challenge restart if there's been one since. Ticks from before
    /// stay in `completions` — they just aren't counted.
    var statsFirstDayKey: String {
        guard let statsStartDate else { return firstDayKey }
        return max(firstDayKey, Goal.dayKey(statsStartDate))
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
            let key = Goal.dayKey(cursor)
            if key >= statsFirstDayKey && completions[key] == true { count += 1 }
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

    /// Recent history, oldest first, for drawing the dot strip.
    /// Each entry is `true` (done), `false` (missed), or `nil` for a day
    /// the goal wasn't scheduled.
    ///
    /// Fourteen days rather than seven: a week is too short to show a
    /// pattern, so one miss in seven reads as dramatic when it isn't.
    /// Only meaningful for `.specificDays` goals — the other frequency
    /// types have no per-day pass/fail to show.
    /// The actual dates behind `recentHistory`, same order, so a tap on
    /// a dot can be mapped back to the day it represents.
    func recentDates(days: Int = 14) -> [Date] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        return (0..<days).reversed().compactMap {
            calendar.date(byAdding: .day, value: -$0, to: today)
        }
    }

    func recentHistory(days: Int = 14) -> [GoalDayState] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        return (0..<days).reversed().map { offset in
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else {
                return .notScheduled
            }
            // Before a challenge restart counts as a clean slate.
            guard Goal.dayKey(day) >= statsFirstDayKey, isScheduled(on: day) else { return .notScheduled }
            if completions[Goal.dayKey(day)] == true { return .done }
            // Today isn't a miss yet — there's still time.
            return offset == 0 ? .pending : .missed
        }
    }

    /// How many of the last `days` scheduled days were completed, and
    /// how many were scheduled at all. Drives the "12 of 14" figure.
    func recentRate(days: Int = 14) -> (done: Int, scheduled: Int) {
        let states = recentHistory(days: days)
        let scheduled = states.filter { $0 != .notScheduled && $0 != .pending }.count
        let done = states.filter { $0 == .done }.count
        return (done, scheduled)
    }

    /// Every time this goal has ever been completed.
    ///
    /// The number that matters and the one a streak destroys: it only
    /// ever goes up. A bad week knocks a streak to zero but leaves this
    /// untouched, which is a truer picture of the reps accumulated.
    var totalCompletions: Int {
        let start = statsFirstDayKey
        switch frequencyType {
        case .timesPerDay:
            return completionCounts.filter { $0.key >= start }.values.reduce(0, +)
        case .specificDays, .timesPerWeek:
            return completions.filter { $0.key >= start && $0.value }.count
        }
    }

    /// How many scheduled days in a row, counting back from yesterday,
    /// have been missed.
    ///
    /// Starts at yesterday rather than today because today isn't over —
    /// an untouched goal at 9am isn't a miss yet. Days the goal wasn't
    /// scheduled are skipped rather than breaking the run.
    var consecutiveMisses: Int {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        var count = 0
        for offset in 1...60 {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { break }
            // A challenge restart is a clean slate: stop counting there.
            if Goal.dayKey(day) < statsFirstDayKey { break }
            guard isScheduled(on: day) else { continue }
            if completions[Goal.dayKey(day)] == true { break }
            // No record at all also counts — an unmarked scheduled day
            // in the past didn't happen.
            count += 1
        }
        return count
    }

    /// Something worth saying, or nothing.
    ///
    /// Deliberately silent at one miss: a single missed day doesn't
    /// measurably affect habit formation, so flagging it would be
    /// telling the user off for noise. Two in a row is the point where
    /// the research says it starts to matter.
    var missNudge: String? {
        guard frequencyType == .specificDays else { return nil }
        // Done today means it has been picked back up.
        guard !isCompletedToday else { return nil }
        let misses = consecutiveMisses
        guard misses >= 2 else { return nil }
        return "Missed \(misses) in a row — worth picking back up today."
    }

    /// Percent of *known* days completed. Days with no record at all are
    /// ignored rather than counted as misses, so a brand-new goal doesn't
    /// start at 0%.
    var completionPercentage: Int {
        let start = statsFirstDayKey
        let known = completions.filter { $0.key >= start }.values
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

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension ScheduleVersion {
    enum CodingKeys: String, CodingKey {
        case id, effectiveFrom, repeatDays, startMinutes, durationMinutes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        effectiveFrom = try c.decodeIfPresent(Date.self, forKey: .effectiveFrom) ?? .distantPast
        repeatDays = try c.decodeIfPresent(Set<Int>.self, forKey: .repeatDays) ?? Goal.allDays
        startMinutes = try c.decodeIfPresent(Int.self, forKey: .startMinutes) ?? 21 * 60
        durationMinutes = try c.decodeIfPresent(Int.self, forKey: .durationMinutes) ?? 30
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(effectiveFrom, forKey: .effectiveFrom)
        try c.encode(repeatDays, forKey: .repeatDays)
        try c.encode(startMinutes, forKey: .startMinutes)
        try c.encode(durationMinutes, forKey: .durationMinutes)
    }
}
