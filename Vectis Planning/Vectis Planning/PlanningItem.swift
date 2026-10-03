import Foundation

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
