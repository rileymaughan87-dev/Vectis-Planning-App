import SwiftUI
import Combine

/// The app's landing screen: what's happening right now, what's next,
/// today's goals, and a task list.
///
/// The layout is deliberately fixed — nothing scrolls except inside the
/// goals and tasks boxes. Opening the app should answer "what am I meant
/// to be doing" at a glance, and that stops being true the moment you
/// have to scroll to find out.
struct HomeView: View {
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var tasksStore: TasksStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var newTaskText = ""

    // Ticks every 30s so "42 min left" and the current block stay
    // roughly accurate without re-rendering constantly.
    @State private var now = Date()
    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 0) {
            fixedTopSection
            goalsBox
            tasksBox
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
        .onReceive(timer) { now = $0 }
    }

    // MARK: - Current and next

    /// The event happening right now, if any.
    private var currentEvent: CalendarEvent? {
        calendarStore.events
            .filter { $0.flowsToDaily }
            .first { $0.startDate <= now && $0.endDate > now }
    }

    /// The next event starting today after right now.
    private var nextEvent: CalendarEvent? {
        calendarStore.events
            .filter { $0.flowsToDaily && $0.startDate > now && Calendar.current.isDateInToday($0.startDate) }
            .sorted { $0.startDate < $1.startDate }
            .first
    }

    private var fixedTopSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(now.formatted(.dateTime.weekday(.wide).hour().minute()))
                .font(.caption)
                .foregroundStyle(.secondary)

            if let event = currentEvent {
                currentBlock(event)
            } else {
                emptyNowBlock
            }

            if let next = nextEvent {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("Next: \(next.title) at \(next.startDate.formatted(date: .omitted, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                        .fill(Color(.secondarySystemGroupedBackground))
                )
            }
        }
        .padding(.top, 4)
    }

    private func currentBlock(_ event: CalendarEvent) -> some View {
        let color = Color(hex: calendarStore.category(for: event.categoryID)?.colorHex ?? "999999")
        let minutesLeft = max(Int(event.endDate.timeIntervalSince(now) / 60), 0)

        return VStack(alignment: .leading, spacing: 3) {
            Text("RIGHT NOW")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(event.title)
                .font(.title2.weight(.bold))
                .lineLimit(2)
            Text("\(event.startDate.formatted(date: .omitted, time: .shortened)) – \(event.endDate.formatted(date: .omitted, time: .shortened)) · \(minutesLeft) min left")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(alignment: .leading) {
            Rectangle().fill(color).frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous))
    }

    private var emptyNowBlock: some View {
        VStack(spacing: 4) {
            Text("RIGHT NOW")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("Nothing scheduled")
                .font(.headline)
            Text(nextEvent != nil
                 ? "Open time until \(nextEvent!.startDate.formatted(date: .omitted, time: .shortened))."
                 : "Nothing else on today.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .strokeBorder(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4]))
        )
    }

    // MARK: - Goals

    private var todaysGoals: [Goal] {
        goalsStore.goals.filter { $0.kind == .shortTerm && $0.isScheduled(on: now) }
    }

    private var goalsBox: some View {
        let goals = todaysGoals
        let dayKey = Goal.dayKey(now)
        let left = goals.filter { $0.completions[dayKey] != true }.count

        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("TODAY'S GOALS")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(left) left")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if goals.isEmpty {
                Text("No goals scheduled today.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(goals) { goal in
                            Button {
                                goalsStore.setToday(goal.id, done: goal.completions[dayKey] != true)
                            } label: {
                                HStack(spacing: 8) {
                                    CompletionMark(
                                        isOn: goal.completions[dayKey] == true,
                                        size: 16,
                                        color: appearanceStore.primaryColor
                                    )
                                    Text(goal.title)
                                        .font(.subheadline)
                                        .strikethrough(goal.completions[dayKey] == true)
                                        .foregroundStyle(goal.completions[dayKey] == true ? .secondary : .primary)
                                    Spacer()
                                }
                                .padding(.vertical, 5)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 110)
                .padding(.leading, 10)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(appearanceStore.primaryColor)
                        .frame(width: 3)
                }
            }
        }
        .padding(.top, 16)
    }

    // MARK: - Tasks

    private var tasksBox: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Tasks")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(tasksStore.incompleteCount) left")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)

            Divider()

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(tasksStore.sortedTasks) { task in
                        taskRow(task)
                    }

                    HStack(spacing: 8) {
                        Image(systemName: "plus")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("Add a task", text: $newTaskText)
                            .font(.subheadline)
                            .onSubmit {
                                tasksStore.addTask(newTaskText)
                                newTaskText = ""
                            }
                    }
                    .padding(.vertical, 7)
                }
                .padding(.horizontal, 12)
            }
        }
        .frame(maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .padding(.top, 14)
    }

    private func taskRow(_ task: VectisTask) -> some View {
        HStack(spacing: 8) {
            Button {
                tasksStore.toggle(task.id)
            } label: {
                CompletionMark(isOn: task.done, size: 16, color: appearanceStore.primaryColor)
            }
            .buttonStyle(.plain)

            Text(task.text)
                .font(.subheadline)
                .strikethrough(task.done)
                .foregroundStyle(task.done ? .secondary : .primary)

            Spacer()

            Button {
                tasksStore.delete(task.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 7)
    }
}
