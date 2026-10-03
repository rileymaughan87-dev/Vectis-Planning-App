import SwiftUI

/// The unified shape of something that needs a slot found for it — a
/// goal not yet on the calendar, or a task with a duration set. Same
/// problem either way, so both the capture popup and the drag tray use
/// this one definition rather than each keeping their own notion of
/// "what's unplaced," which could drift out of sync with each other.
enum PlanningItemSource {
    case goal(Goal)
    case task(VectisTask)
}

struct PlanningItem: Identifiable {
    let id: UUID
    let title: String
    let durationMinutes: Int
    let source: PlanningItemSource
}

enum PlanningItems {
    /// A short-term goal due today that hasn't been given a slot yet.
    /// Once `scheduledOnCalendar` is true it's pre-placed and drops out
    /// here — neither the popup nor the tray has anything left to ask
    /// about it.
    static func unplacedGoals(goalsStore: GoalsStore, date: Date) -> [Goal] {
        goalsStore.goals.filter {
            $0.kind == .shortTerm && $0.isScheduled(on: date) && !$0.scheduledOnCalendar
        }
    }

    /// A task with a duration that hasn't been dragged onto the grid
    /// yet — `scheduledDate == nil` is what "unplaced" means for a task.
    static func unplacedTasks(tasksStore: TasksStore) -> [VectisTask] {
        tasksStore.tasks.filter { !$0.done && $0.durationMinutes != nil && $0.scheduledDate == nil }
    }

    /// Longest first, regardless of source — a 90-minute goal and a
    /// 90-minute task have the same problem either way.
    static func all(goalsStore: GoalsStore, tasksStore: TasksStore, date: Date) -> [PlanningItem] {
        let goalItems = unplacedGoals(goalsStore: goalsStore, date: date).map {
            PlanningItem(id: $0.id, title: $0.title, durationMinutes: $0.scheduledDurationMinutes, source: .goal($0))
        }
        let taskItems = unplacedTasks(tasksStore: tasksStore).map {
            PlanningItem(id: $0.id, title: $0.text, durationMinutes: $0.durationMinutes ?? 30, source: .task($0))
        }
        return (goalItems + taskItems).sorted { $0.durationMinutes > $1.durationMinutes }
    }
}

// MARK: - Buffer awareness

/// How much of the visible day is already spoken for. One calculation,
/// used by both the capture popup and the drag tray, so the two can
/// never show different numbers for the same day.
///
/// "Committed" is the time covered by at least one block on the Daily
/// grid (see `DayBlocks`), leaving out placed tasks already done. Overlapping blocks count
/// once: a goal sitting on top of a meeting doesn't make the day any
/// fuller, and summing them could push the figure past 100%.
enum PlanningCommitment {
    /// Above this, a day tends to unravel as soon as anything runs long.
    static let comfortableLimit = 0.8

    static func fraction(
        calendarStore: CalendarStore,
        goalsStore: GoalsStore,
        tasksStore: TasksStore,
        date: Date
    ) -> Double {
        let dayStart = Calendar.current.startOfDay(for: date)
        let windowStart = dayStart.addingTimeInterval(TimeInterval(calendarStore.dailyCalendarStartHour * 3600))
        let windowEnd = dayStart.addingTimeInterval(TimeInterval(calendarStore.dailyCalendarEndHour * 3600))
        let windowLength = windowEnd.timeIntervalSince(windowStart)
        guard windowLength > 0 else { return 0 }

        // Done tasks no longer take up time; everything else on the
        // grid does, including goals already ticked off.
        let intervals = DayBlocks.blocks(on: date, calendarStore: calendarStore, goalsStore: goalsStore, tasksStore: tasksStore)
            .filter { !($0.linkedTaskID != nil && $0.isCompleted) }
            .map { (start: $0.startDate, end: $0.endDate) }

        return coveredLength(of: intervals, from: windowStart, to: windowEnd) / windowLength
    }

    /// Total time inside the window covered by at least one interval.
    private static func coveredLength(of intervals: [(start: Date, end: Date)], from windowStart: Date, to windowEnd: Date) -> TimeInterval {
        let clipped = intervals
            .map { (start: max($0.start, windowStart), end: min($0.end, windowEnd)) }
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start }

        var total: TimeInterval = 0
        var current: (start: Date, end: Date)?
        for interval in clipped {
            if let open = current, interval.start <= open.end {
                current = (open.start, max(open.end, interval.end))
            } else {
                if let open = current { total += open.end.timeIntervalSince(open.start) }
                current = interval
            }
        }
        if let open = current { total += open.end.timeIntervalSince(open.start) }
        return total
    }
}

/// A thin "Day committed N%" bar. Information only — it never blocks
/// placing anything and never inserts gaps. Above 80% it turns amber
/// and says why that matters, once, in plain language.
struct CommitmentBar: View {
    let fraction: Double
    let accentColor: Color

    private var isOverLimit: Bool { fraction > PlanningCommitment.comfortableLimit }
    private var percent: Int { Int((fraction * 100).rounded()) }
    // Warning colours are semantic, not themed (see design system).
    private var barColor: Color { isOverLimit ? .orange : accentColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Day committed \(percent)%")
                .font(.caption2.weight(.medium))
                .foregroundStyle(isOverLimit ? .orange : .secondary)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Color(.tertiarySystemFill))
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(barColor)
                        .frame(width: geo.size.width * min(max(fraction, 0), 1))
                }
            }
            .frame(height: 4)
            if isOverLimit {
                Text("Above 80% tends to unravel when anything runs long.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
