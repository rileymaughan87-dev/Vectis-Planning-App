import SwiftUI

/// The main Goals screen: a Short-term section and a Long-term section,
/// matching the design we mocked up together.
struct GoalsView: View {
    // Changed from `@StateObject` to `@ObservedObject`: this View no
    // longer creates its own store, it's handed one from outside (by
    // whatever screen sits above it — see ContentView). This is what
    // lets the Daily calendar's goals strip and this page both read
    // and write the exact same data, staying in sync automatically.
    @ObservedObject var store: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    @ObservedObject var peopleStore: PeopleStore

    @State private var showingAddShortTerm = false

    // Setting this to a goal opens the editor sheet for it. `.sheet(item:)`
    // watches this and shows the sheet automatically whenever it's non-nil.
    @State private var editingGoal: Goal?
    @State private var editingGoalIsNew = false
    @State private var editingShortTermGoal: Goal?
    @State private var showingChallenges = false
    @State private var catchUpGoal: Goal?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SectionBox(title: "Short-term goals", accent: appearanceStore.primaryColor) {
                        ForEach(store.standaloneShortTermGoals) { goal in
                            ShortTermGoalRow(
                                goal: goal,
                                store: store,
                                accentColor: appearanceStore.primaryColor,
                                onTapName: { editingShortTermGoal = goal },
                                onOpenApp: launchApp,
                                peopleStore: peopleStore
                            )
                            .contextMenu {
                                Button("Edit") { editingShortTermGoal = goal }
                                Button("Delete", role: .destructive) {
                                    store.deleteGoal(goal.id)
                                }
                            }
                        }
                        Button {
                            showingAddShortTerm = true
                        } label: {
                            Label("Add goal", systemImage: "plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.primaryColor))
                    }

                    SectionBox(title: "Long-term goals", accent: appearanceStore.secondaryColor) {
                        ForEach(store.longTermGoals) { goal in
                            LongTermGoalCard(
                                goal: goal,
                                store: store,
                                accentColor: appearanceStore.secondaryColor,
                                habitAccentColor: appearanceStore.primaryColor,
                                onTapName: {
                                    editingGoalIsNew = false
                                    editingGoal = goal
                                },
                                onTapHabit: { habit in editingShortTermGoal = habit },
                                onOpenApp: launchApp,
                                peopleStore: peopleStore
                            )
                            .contextMenu {
                                Button("Edit") {
                                    editingGoalIsNew = false
                                    editingGoal = goal
                                }
                                Button("Delete", role: .destructive) {
                                    store.deleteGoal(goal.id)
                                }
                            }
                        }
                        HStack(spacing: 10) {
                            Button {
                                editingGoalIsNew = true
                                editingGoal = Goal(title: "", kind: .longTerm)
                            } label: {
                                Label("Add goal", systemImage: "plus")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.secondaryColor))

                            Button {
                                showingChallenges = true
                            } label: {
                                Label("Challenges", systemImage: "flag")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.secondaryColor))
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom)
            }
            .sheet(isPresented: $showingAddShortTerm) {
                AddShortTermGoalSheet(store: store)
            }
            .sheet(item: $editingGoal) { goal in
                LongTermGoalEditorSheet(goal: goal, store: store, isNewCreation: editingGoalIsNew, accentColor: appearanceStore.secondaryColor)
            }
            .sheet(item: $editingShortTermGoal) { goal in
                ShortTermGoalEditorSheet(goal: goal, store: store, linkedAppsStore: linkedAppsStore, peopleStore: peopleStore)
            }
            .sheet(isPresented: $showingChallenges) {
                ChallengeBrowserSheet(store: store, appearanceStore: appearanceStore)
            }
            .sheet(item: $catchUpGoal) { goal in
                ChallengeCatchUpSheet(goal: goal, store: store, appearanceStore: appearanceStore)
            }
            .onAppear {
                // Surface the catch-up prompt for the first challenge
                // with unconfirmed days — the same honest "we don't know
                // what happened while you were away" pattern.
                catchUpGoal = store.activeChallenges.first { !store.unresolvedDays(for: $0).isEmpty }
            }
        }
    }

    /// Records that you're heading into an app, then opens it. The
    /// recording is what makes the return check-in possible — without
    /// it we'd have no idea you'd left, or for how long.
    private func launchApp(_ goal: Goal, scheme: String, appName: String) {
        linkedAppsStore.beginLaunch(goalID: goal.id, appName: appName)
        if !AppLauncher.open(scheme) {
            // Opening failed — don't leave a phantom pending launch
            // that would trigger a check-in for something that never
            // happened.
            linkedAppsStore.clearPendingLaunch()
        }
    }

}

// MARK: - Short-term goal row

/// One row: title, a "Today" tick button, and a 7-day streak strip.
/// Used both in the flat Short-term list and nested inside a long-term
/// goal's card for its linked habits — same row, same underlying data,
/// so ticking it off in either place stays in sync automatically.
struct ShortTermGoalRow: View {
    let goal: Goal
    @ObservedObject var store: GoalsStore

    // Defaults to the original fixed teal so any call site that hasn't
    // been updated yet still renders sensibly — but GoalsView always
    // passes the live appearance color explicitly.
    var accentColor: Color = .vectisTeal

    var onTapName: () -> Void

    /// Called when the linked-app button is tapped. Optional so the row
    /// still works in places that don't handle app launching.
    var onOpenApp: ((Goal, String, String) -> Void)? = nil

    /// Optional so the row still renders in contexts without people
    /// loaded — the contact actions just don't appear.
    var peopleStore: PeopleStore? = nil

    // When this row is nested inside a LongTermGoalCard (a linked daily
    // habit), it gets a slightly smaller, lighter card so it visually
    // reads as "inside" the parent rather than a peer of it.
    var isNested: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Button(action: onTapName) {
                    Text(goal.title)
                        .font(.subheadline)
                        .underline()
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
                Spacer()
                switch goal.frequencyType {
                case .specificDays, .timesPerWeek:
                    Button {
                        store.setToday(goal.id, done: !goal.isCompletedToday)
                    } label: {
                        HStack(spacing: 4) {
                            CompletionMark(isOn: goal.isCompletedToday, size: 16, color: accentColor)
                            Text("Today")
                        }
                        .font(.caption)
                    }
                    .buttonStyle(.plain)
                    .disabled(!goal.isScheduledToday)
                    .opacity(goal.isScheduledToday ? 1 : 0.35)

                case .timesPerDay:
                    HStack(spacing: 10) {
                        Button {
                            store.decrementTodayCount(goal.id)
                        } label: {
                            Image(systemName: "minus.circle")
                        }
                        .buttonStyle(.plain)
                        .disabled(goal.todayCompletionCount == 0)

                        Text("\(goal.todayCompletionCount)/\(goal.timesPerDayTarget)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(goal.isCompletedToday ? accentColor : .secondary)
                            .frame(minWidth: 28)

                        Button {
                            store.incrementTodayCount(goal.id)
                        } label: {
                            Image(systemName: "plus.circle.fill")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(accentColor)
                        .disabled(goal.todayCompletionCount >= goal.timesPerDayTarget)
                    }
                }
            }

            switch goal.frequencyType {
            case .specificDays:
                HStack {
                    HStack(spacing: 4) {
                        ForEach(Array(goal.last7DaysHistory().enumerated()), id: \.offset) { _, done in
                            streakDot(done)
                        }
                    }
                    Spacer()
                    trailingLabels
                }

            case .timesPerWeek:
                HStack {
                    Text("\(goal.weeklyCompletionCount()) of \(goal.timesPerWeekTarget) this week")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    trailingLabels
                }

            case .timesPerDay:
                HStack {
                    Text("Today")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    trailingLabels
                }
            }

            if let personID = goal.linkedPersonID, let peopleStore {
                ContactActionsRow(
                    personID: personID,
                    peopleStore: peopleStore,
                    accentColor: accentColor
                )
                .padding(.top, 2)
            }

            if let scheme = goal.linkedAppScheme, let appName = goal.linkedAppName, let onOpenApp {
                Button {
                    onOpenApp(goal, scheme, appName)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.forward.app")
                        Text("Open \(appName)")
                        Spacer()
                    }
                    .font(.caption)
                    .foregroundStyle(accentColor)
                    .padding(.vertical, 7)
                    .padding(.horizontal, 10)
                    .background(
                        RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                            .fill(accentColor.opacity(0.12))
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(isNested ? 10 : 14)
        .background(
            RoundedRectangle(cornerRadius: isNested ? DesignTokens.smallRadius : DesignTokens.cardRadius, style: .continuous)
                .fill(Color(isNested ? .tertiarySystemGroupedBackground : .secondarySystemGroupedBackground))
        )
        .overlay(
            // Nested habit rows skip the border — they're already visually
            // contained by their parent goal's card, so another outline
            // would just add noise.
            Group {
                if !isNested {
                    RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                        .strokeBorder(accentColor.opacity(0.3), lineWidth: 1)
                }
            }
        )
    }

    @ViewBuilder
    private var trailingLabels: some View {
        if goal.scheduledOnCalendar {
            Label(goal.scheduledTimeText, systemImage: "clock")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        if let endDate = goal.endDate {
            Text("until \(endDate.formatted(date: .abbreviated, time: .omitted))")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        if goal.frequencyType == .specificDays {
            Text("\(goal.completionPercentage)%")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func streakDot(_ done: Bool?) -> some View {
        switch done {
        case true:
            Circle().fill(accentColor).frame(width: 10, height: 10)
        case false:
            Circle().strokeBorder(.secondary, lineWidth: 1.5).frame(width: 10, height: 10)
        case nil:
            Circle().fill(Color.secondary.opacity(0.15)).frame(width: 10, height: 10)
        }
    }
}

// MARK: - Long-term goal card

/// A long-term goal's card: name (tap to edit), then either a milestone
/// checklist with a progress bar, or a note log if it has no milestones,
/// followed by any linked daily habits nested underneath.
struct LongTermGoalCard: View {
    let goal: Goal
    @ObservedObject var store: GoalsStore

    // Same fallback-default reasoning as ShortTermGoalRow above.
    var accentColor: Color = .vectisCoral
    var habitAccentColor: Color = .vectisTeal

    var onTapName: () -> Void
    var onTapHabit: (Goal) -> Void
    var onOpenApp: ((Goal, String, String) -> Void)? = nil
    var peopleStore: PeopleStore? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button(action: onTapName) {
                    Text(goal.title)
                        .font(.subheadline.weight(.medium))
                        .underline()
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
                Spacer()
                if let day = store.challengeDay(for: goal), goal.challengeTemplateID != nil {
                    Text("Day \(day)\(goal.challengeAttempt > 1 ? " · attempt \(goal.challengeAttempt)" : "")")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(accentColor)
                } else if goal.isTargetOverdue {
                    Text("Overdue")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                } else if let targetDate = goal.targetDate {
                    Text("by \(targetDate.formatted(date: .abbreviated, time: .omitted))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if goal.milestones.isEmpty {
                notesView
            } else {
                milestonesView
            }

            let linked = store.linkedGoals(for: goal.id)
            if !linked.isEmpty {
                Divider()
                Text("Daily habits for this goal")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                ForEach(linked) { habit in
                    ShortTermGoalRow(
                        goal: habit,
                        store: store,
                        accentColor: habitAccentColor,
                        onTapName: { onTapHabit(habit) },
                        onOpenApp: onOpenApp,
                        peopleStore: peopleStore,
                        isNested: true
                    )
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .strokeBorder(accentColor.opacity(0.3), lineWidth: 1)
        )
    }

    private var notesView: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(goal.notes.sorted(by: { $0.date > $1.date })) { note in
                Text("\(note.date.formatted(date: .abbreviated, time: .omitted)) — \(note.text)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var milestonesView: some View {
        VStack(alignment: .leading, spacing: 4) {
            ProgressView(value: Double(goal.milestones.completionPercentage), total: 100)
                .tint(accentColor)

            ForEach(goal.milestones) { milestone in
                HStack {
                    Button {
                        store.toggleMilestone(goalID: goal.id, milestoneID: milestone.id)
                    } label: {
                        CompletionMark(isOn: milestone.done, size: 15, color: accentColor)
                    }
                    .buttonStyle(.plain)
                    Text(milestone.title)
                        .font(.caption)
                        .strikethrough(milestone.done)
                        .foregroundStyle(milestone.done ? .secondary : .primary)
                    Spacer()
                    if milestone.isOverdue {
                        Text("Overdue")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.red)
                    } else if milestone.addToCalendar, let date = milestone.date {
                        Text(date.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            let done = goal.milestones.filter { $0.done }.count
            Text("\(done) of \(goal.milestones.count) milestones · \(goal.milestones.completionPercentage)%")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    GoalsView(store: GoalsStore(), appearanceStore: AppearanceStore(), linkedAppsStore: LinkedAppsStore(), peopleStore: PeopleStore())
}

