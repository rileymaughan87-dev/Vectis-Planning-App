import SwiftUI

/// The unified shape of something the capture popup can offer a
/// duration for — a goal not yet on the calendar, or a task with a
/// duration set. Same problem either way: it needs a gap found for it,
/// and sorting/display treats both identically. Source only matters
/// for which icon shows and what "give it a time" actually does.
private enum PlanningItemSource {
    case goal(Goal)
    case task(VectisTask)
}

private struct PlanningItem: Identifiable {
    let id: UUID
    let title: String
    let durationMinutes: Int
    let source: PlanningItemSource
}

/// Stage 1 of morning planning: capture, not placement. Reviews what's
/// already fixed today, then works through anything flexible that
/// still needs a duration decided — big things first, matching the
/// spec's "sort the tray longest-first" rule, here applied to the list
/// order directly since there's no tray yet.
///
/// What this deliberately does NOT do yet: place anything on the
/// calendar via drag, or offer to break a task into parts (parts only
/// exist on `CalendarEvent`, and nothing here creates one). Goals CAN
/// be given a real time here, reusing the same calendar-scheduling
/// fields the goal editor already has — that's a genuine placement,
/// just via a time picker rather than a drag gesture. Tasks can only
/// have their duration confirmed here; actually placing a task on the
/// grid is Stage 2's job.
struct DailyPlanningCaptureView: View {
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var tasksStore: TasksStore
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var appearanceStore: AppearanceStore
    let date: Date

    @Environment(\.dismiss) private var dismiss

    private enum Step: Int, CaseIterable {
        case context, big, small
    }

    @State private var step: Step = .context

    // MARK: - Sourcing

    private var fixedEvents: [CalendarEvent] {
        calendarStore.timedEvents(on: date)
            .filter { $0.flowsToDaily && !$0.isAllDay && !$0.isFlexible }
            .sorted { $0.startDate < $1.startDate }
    }

    /// A short-term goal due today that hasn't been given a slot yet.
    /// Once `scheduledOnCalendar` is true it's pre-placed — this popup
    /// has nothing left to ask about it, so it drops out of the list
    /// the moment "give it a time" is confirmed.
    private var unplacedGoals: [Goal] {
        goalsStore.goals.filter {
            $0.kind == .shortTerm && $0.isScheduled(on: date) && !$0.scheduledOnCalendar
        }
    }

    private var unplacedTasks: [VectisTask] {
        tasksStore.tasks.filter { !$0.done && $0.durationMinutes != nil }
    }

    private var allUnplacedItems: [PlanningItem] {
        let goalItems = unplacedGoals.map {
            PlanningItem(id: $0.id, title: $0.title, durationMinutes: $0.scheduledDurationMinutes, source: .goal($0))
        }
        let taskItems = unplacedTasks.map {
            PlanningItem(id: $0.id, title: $0.text, durationMinutes: $0.durationMinutes ?? 30, source: .task($0))
        }
        // Longest first, regardless of source — a 90-minute goal and a
        // 90-minute task have the same problem either way.
        return (goalItems + taskItems).sorted { $0.durationMinutes > $1.durationMinutes }
    }

    // ~60 minutes decides the split; nothing breaks if something sits
    // right on the boundary, since this only decides which step it
    // surfaces in, not how it behaves.
    private var bigItems: [PlanningItem] { allUnplacedItems.filter { $0.durationMinutes >= 60 } }
    private var smallItems: [PlanningItem] { allUnplacedItems.filter { $0.durationMinutes < 60 } }

    /// Which steps actually have something to show — a step with
    /// nothing in it is skipped rather than shown empty.
    private var activeSteps: [Step] {
        Step.allCases.filter {
            switch $0 {
            case .context: return !fixedEvents.isEmpty
            case .big: return !bigItems.isEmpty
            case .small: return !smallItems.isEmpty
            }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if activeSteps.isEmpty {
                    emptyState
                } else {
                    stepContent
                }
            }
            .navigationTitle("Plan today")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                if let next = nextStep {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Next") { step = next }
                    }
                } else if !activeSteps.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
            .onAppear {
                // Lands on whichever step actually has something,
                // rather than always starting at "context" and forcing
                // a tap through empty steps to get anywhere useful.
                if let first = activeSteps.first {
                    step = first
                }
            }
        }
    }

    private var nextStep: Step? {
        guard let index = activeSteps.firstIndex(of: step) else { return nil }
        let following = activeSteps.index(after: index)
        return following < activeSteps.count ? activeSteps[following] : nil
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .context:
            PlanningContextStep(events: fixedEvents)
        case .big:
            PlanningItemsStep(
                title: "Big things today",
                subtitle: "These need a real chunk of time. Give one a slot now, or leave it for later.",
                items: bigItems,
                goalsStore: goalsStore,
                tasksStore: tasksStore,
                appearanceStore: appearanceStore,
                date: date
            )
        case .small:
            PlanningItemsStep(
                title: "Smaller things",
                subtitle: "Goals and quick tasks — place what you want to, skip the rest.",
                items: smallItems,
                goalsStore: goalsStore,
                tasksStore: tasksStore,
                appearanceStore: appearanceStore,
                date: date
            )
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer()
            Text("Nothing to plan")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("No fixed events, and nothing flexible waiting for a slot today.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }
}

// MARK: - Step 1: fixed context

private struct PlanningContextStep: View {
    let events: [CalendarEvent]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Already on your day")
                    .font(.headline)
                Text("Fixed commitments — these don't move.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(events) { event in
                    HStack(spacing: 10) {
                        Image(systemName: "lock.fill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(event.startDate.formatted(date: .omitted, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 60, alignment: .leading)
                        Text(event.title)
                            .font(.subheadline)
                    }
                }
            }
            .padding()
        }
    }
}

// MARK: - Steps 2/3: unplaced items

private struct PlanningItemsStep: View {
    let title: String
    let subtitle: String
    let items: [PlanningItem]
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var tasksStore: TasksStore
    @ObservedObject var appearanceStore: AppearanceStore
    let date: Date

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(items) { item in
                    PlanningItemRow(
                        item: item,
                        goalsStore: goalsStore,
                        tasksStore: tasksStore,
                        appearanceStore: appearanceStore,
                        date: date
                    )
                }
            }
            .padding()
        }
    }
}

/// One unplaced item's row — duration always editable, plus a "give it
/// a time" action for goals specifically, since only goals carry the
/// calendar-scheduling fields needed to actually place something here.
private struct PlanningItemRow: View {
    let item: PlanningItem
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var tasksStore: TasksStore
    @ObservedObject var appearanceStore: AppearanceStore
    let date: Date

    @State private var minutes: Int
    @State private var showingTimePicker = false
    @State private var chosenTime = Date()

    init(item: PlanningItem, goalsStore: GoalsStore, tasksStore: TasksStore, appearanceStore: AppearanceStore, date: Date) {
        self.item = item
        self.goalsStore = goalsStore
        self.tasksStore = tasksStore
        self.appearanceStore = appearanceStore
        self.date = date
        _minutes = State(initialValue: item.durationMinutes)
    }

    private var isGoal: Bool {
        if case .goal = item.source { return true }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: isGoal ? "target" : "checkmark.circle")
                    .foregroundStyle(appearanceStore.primaryColor)
                Text(item.title)
                    .font(.subheadline)
                Spacer()
                Stepper(
                    "\(minutes / 60 > 0 ? "\(minutes / 60)h " : "")\(minutes % 60)m",
                    value: $minutes,
                    in: 5...480,
                    step: 5
                )
                .fixedSize()
                .labelsHidden()
                .onChange(of: minutes) { _, newValue in
                    commitDuration(newValue)
                }
            }
            Text("\(minutes / 60 > 0 ? "\(minutes / 60)h " : "")\(minutes % 60)m")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if isGoal {
                if showingTimePicker {
                    HStack {
                        DatePicker("", selection: $chosenTime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                        Button("Confirm") {
                            confirmPlacement()
                        }
                        .buttonStyle(VectisButtonStyle(kind: .primary, accent: appearanceStore.primaryColor))
                        Button("Cancel") {
                            showingTimePicker = false
                        }
                        .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.primaryColor))
                    }
                } else {
                    Button("Give it a time") {
                        showingTimePicker = true
                    }
                    .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.primaryColor))
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    private func commitDuration(_ newValue: Int) {
        switch item.source {
        case .goal(let goal):
            if let index = goalsStore.goals.firstIndex(where: { $0.id == goal.id }) {
                goalsStore.goals[index].scheduledDurationMinutes = newValue
            }
        case .task(let task):
            tasksStore.setDuration(task.id, minutes: newValue)
        }
    }

    private func confirmPlacement() {
        guard case .goal(let goal) = item.source else { return }
        let calendar = Calendar.current
        let comps = calendar.dateComponents([.hour, .minute], from: chosenTime)
        let startMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
        goalsStore.scheduleOnCalendar(goal.id, startMinutes: startMinutes, durationMinutes: minutes)
        showingTimePicker = false
    }
}
