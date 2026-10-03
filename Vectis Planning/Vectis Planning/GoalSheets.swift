import SwiftUI

/// A row of tappable day circles (Sun–Sat) plus "Every day / Weekdays /
/// Weekends" shortcuts, bound directly to a goal's `repeatDays`.
///
/// Pulled out as its own View so the creation form and the editor both
/// use the exact same picker rather than two separate copies that could
/// quietly drift apart over time.
struct RepeatDaysPicker: View {
    @Binding var repeatDays: Set<Int>
    /// Explicit rather than `Color.accentColor`, which depends on its
    /// surroundings and didn't reliably follow the chosen theme.
    var accent: Color = .vectisBlue

    private let weekdaySymbols = Calendar.current.shortWeekdaySymbols

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                ForEach(1...7, id: \.self) { weekday in
                    dayToggle(weekday)
                }
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)

            HStack {
                presetButton("Every day", days: Goal.allDays)
                presetButton("Weekdays", days: Goal.weekdaysOnly)
                presetButton("Weekends", days: Goal.weekendOnly)
            }
        }
    }

    @ViewBuilder
    private func dayToggle(_ weekday: Int) -> some View {
        let isOn = repeatDays.contains(weekday)
        Button {
            if isOn {
                repeatDays.remove(weekday)
            } else {
                repeatDays.insert(weekday)
            }
        } label: {
            Text(weekdaySymbols[weekday - 1])
                .font(.caption2.weight(.medium))
                .frame(width: 36, height: 36)
                .background(isOn ? accent : Color.secondary.opacity(0.15))
                .foregroundStyle(isOn ? accent.contrastingTextColor : Color.primary)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private func presetButton(_ label: String, days: Set<Int>) -> some View {
        Button(label) {
            repeatDays = days
        }
        .buttonStyle(.plain)
        .font(.caption)
        .foregroundStyle(accent)
        .frame(maxWidth: .infinity)
    }
}

/// An optional date, off by default. Toggling it on reveals a direct
/// date picker plus quick presets (2 weeks, 1 month, etc.) for common
/// durations, so "read 30 min/day for 2 months" is one tap, while an
/// exact date like "by August 2027" is still just as easy to set.
///
/// Reused for both a short-term goal's `endDate` and a long-term goal's
/// `targetDate` — same picker, different labels.
struct GoalDatePicker: View {
    @Binding var date: Date?
    var toggleLabel: String = "Set an end date"
    var dateLabel: String = "Ends on"
    var accent: Color = .vectisBlue

    var body: some View {
        Toggle(toggleLabel, isOn: Binding(
            get: { date != nil },
            set: { isOn in date = isOn ? (date ?? defaultDate) : nil }
        ))

        if date != nil {
            DatePicker(
                dateLabel,
                selection: Binding(get: { date ?? defaultDate }, set: { date = $0 }),
                displayedComponents: .date
            )

            HStack {
                presetButton("2 weeks", .day, 14)
                presetButton("1 month", .month, 1)
                presetButton("2 months", .month, 2)
                presetButton("3 months", .month, 3)
            }
        }
    }

    private var defaultDate: Date {
        Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date()
    }

    private func presetButton(_ label: String, _ component: Calendar.Component, _ value: Int) -> some View {
        Button(label) {
            date = Calendar.current.date(byAdding: component, value: value, to: Date())
        }
        .buttonStyle(.plain)
        .font(.caption)
        .foregroundStyle(accent)
        .frame(maxWidth: .infinity)
    }
}

/// Adding a standalone short-term goal. Deliberately has no way to link
/// it to a long-term goal here — that only happens from inside the
/// long-term goal's own editor, so there's exactly one place a link can
/// be created, per what we decided when designing this.
struct AddShortTermGoalSheet: View {
    @ObservedObject var store: GoalsStore
    var accentColor: Color = .vectisBlue
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var repeatDays: Set<Int> = Goal.allDays
    @State private var endDate: Date?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    EditorTitleBox(label: "Name", placeholder: "e.g. Read 30 minutes", text: $name, accent: accentColor)
                    Text("To tie a habit to a long-term goal, add it from within that goal instead.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)

                    EditorBox(title: "Repeats on", accent: accentColor) {
                        RepeatDaysPicker(repeatDays: $repeatDays, accent: accentColor)
                    }

                    EditorBox(title: "Duration", accent: accentColor) {
                        VStack(spacing: 10) {
                            GoalDatePicker(date: $endDate, toggleLabel: "Set a duration", dateLabel: "Ends on", accent: accentColor)
                        }
                        .font(.subheadline)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("New goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.addShortTermGoal(
                            title: name.trimmingCharacters(in: .whitespaces),
                            repeatDays: repeatDays,
                            endDate: endDate
                        )
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || repeatDays.isEmpty)
                }
            }
        }
    }
}

/// Editing an existing long-term goal: rename it, add/remove/edit
/// milestones, and add or remove its linked daily habits — everything
/// about the goal lives in this one screen.
struct LongTermGoalEditorSheet: View {
    // A local, editable *copy* of the goal. Since `Goal` is a struct
    // (value type), changing this doesn't touch the real data in the
    // store until we explicitly call `updateGoal` on Save — which is
    // what makes Cancel able to just throw the changes away.
    @State var goal: Goal

    @ObservedObject var store: GoalsStore

    // True only when this editor is the direct next step right after
    // creating a brand-new goal (see AddLongTermGoalSheet). In that
    // case, Cancel means "actually, forget the whole thing" — so it
    // removes the goal entirely rather than just discarding edits.
    // Editing an existing goal later always leaves this as false.
    var isNewCreation: Bool = false

    // Defaults to the fixed coral so this still renders sensibly if
    // called without one — GoalsView always passes the live color.
    var accentColor: Color = .vectisCoral

    @Environment(\.dismiss) private var dismiss
    @State private var newHabitName = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    EditorTitleBox(label: "Name", placeholder: "e.g. Finish degree", text: $goal.title, accent: accentColor)

                    EditorBox(title: "Target date", accent: accentColor) {
                        VStack(spacing: 10) {
                            GoalDatePicker(date: $goal.targetDate, toggleLabel: "Set a target date", dateLabel: "Complete by", accent: accentColor)
                        }
                        .font(.subheadline)
                    }

                    milestonesBox
                    habitsBox

                    // Only when editing — during creation, Cancel already
                    // discards everything, so a Delete button would be
                    // redundant and slightly confusing.
                    if !isNewCreation {
                        VStack(spacing: 6) {
                            Button("Delete goal") {
                                store.deleteGoal(goal.id)
                                dismiss()
                            }
                            .buttonStyle(VectisButtonStyle(kind: .destructive))
                            Text("Any daily habits linked to this goal will be deleted too.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(isNewCreation ? "New goal" : "Edit goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if isNewCreation {
                            store.discardLongTermGoal(goal.id)
                        }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNewCreation ? "Create" : "Save") {
                        if isNewCreation {
                            store.addLongTermGoal(goal)
                        } else {
                            store.updateGoal(goal)
                        }
                        dismiss()
                    }
                    .disabled(goal.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var milestonesBox: some View {
        EditorBox(title: "Milestones", accent: accentColor, trailing: milestonesSummary) {
            VStack(alignment: .leading, spacing: 12) {
                // The `$` gives a Binding to each milestone, so edits in
                // the row write straight back into `goal.milestones`.
                ForEach($goal.milestones) { $milestone in
                    milestoneRow($milestone)
                    Divider()
                }
                Button {
                    goal.milestones.append(Milestone(title: ""))
                } label: {
                    Label("Add milestone", systemImage: "plus")
                }
                .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))
            }
        }
    }

    private var milestonesSummary: String? {
        guard !goal.milestones.isEmpty else { return nil }
        return "\(goal.milestones.filter { $0.done }.count) of \(goal.milestones.count) done"
    }

    private var habitsBox: some View {
        EditorBox(title: "Daily habits", accent: accentColor) {
            VStack(alignment: .leading, spacing: 10) {
                let linked = store.linkedGoals(for: goal.id)
                if linked.isEmpty {
                    Text("No daily habits linked yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ForEach(linked) { habit in
                    Text(habit.title)
                        .font(.subheadline)
                }
                HStack(spacing: 8) {
                    TextField("e.g. Study 1 hour", text: $newHabitName)
                        .font(.subheadline)
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                                .fill(Color(.tertiarySystemGroupedBackground))
                        )
                    Button("Add") {
                        addHabit()
                    }
                    .buttonStyle(VectisButtonStyle(kind: .primary, accent: accentColor))
                    .fixedSize()
                    .disabled(newHabitName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func milestoneRow(_ milestone: Binding<Milestone>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Button {
                    milestone.wrappedValue.done.toggle()
                } label: {
                    CompletionMark(isOn: milestone.wrappedValue.done, size: 20, color: accentColor)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(milestone.wrappedValue.done ? "Mark not done" : "Mark done")
                TextField("Milestone name", text: milestone.title)
                    .font(.subheadline)
                Button {
                    let id = milestone.wrappedValue.id
                    goal.milestones.removeAll { $0.id == id }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Delete milestone")
            }
            Toggle("Add to calendar", isOn: milestone.addToCalendar)
                .font(.subheadline)
            if milestone.wrappedValue.addToCalendar {
                DatePicker(
                    "Date",
                    selection: Binding(
                        get: { milestone.wrappedValue.date ?? Date() },
                        set: { milestone.wrappedValue.date = $0 }
                    ),
                    displayedComponents: .date
                )
                .font(.subheadline)
            }
        }
    }

    /// Adding a habit here writes straight to the store immediately,
    /// rather than waiting for the outer Save button — matching how we
    /// designed it, since a newly added habit should show up right away
    /// even if you then hit Cancel on the rest of the edit.
    private func addHabit() {
        let trimmed = newHabitName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        store.addShortTermGoal(title: trimmed, linkedTo: goal.id)
        newHabitName = ""
    }
}

/// Editing an existing short-term goal: rename it, and choose which
/// days of the week it repeats on — every day, weekdays only, weekends
/// only, or any custom combination.
struct ShortTermGoalEditorSheet: View {
    @State var goal: Goal
    @ObservedObject var store: GoalsStore
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    @ObservedObject var peopleStore: PeopleStore
    var accentColor: Color = .vectisBlue
    /// Set when opened by tapping a block on the Daily planner. The
    /// editor then offers removing just that day's block instead of
    /// deleting the goal — deleting belongs on the Goals page.
    var openedFromDay: Date? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var showingAppPicker = false
    @State private var showingPersonPicker = false

    // Captured once, when the sheet opens — before any editing happens.
    // Needed because by Save time `goal`'s own fields already hold the
    // edited values, so comparing goal against itself could never
    // detect a change. These three hold what was true before.
    @State private var originalRepeatDays: Set<Int>
    @State private var originalScheduledStartMinutes: Int
    @State private var originalScheduledDurationMinutes: Int

    init(goal: Goal, store: GoalsStore, linkedAppsStore: LinkedAppsStore, peopleStore: PeopleStore, accentColor: Color = .vectisBlue, openedFromDay: Date? = nil) {
        _goal = State(initialValue: goal)
        self.store = store
        self.linkedAppsStore = linkedAppsStore
        self.peopleStore = peopleStore
        self.accentColor = accentColor
        self.openedFromDay = openedFromDay
        _originalRepeatDays = State(initialValue: goal.repeatDays)
        _originalScheduledStartMinutes = State(initialValue: goal.scheduledStartMinutes)
        _originalScheduledDurationMinutes = State(initialValue: goal.scheduledDurationMinutes)
    }

    private var linkedPersonName: String? {
        guard let id = goal.linkedPersonID,
              let person = peopleStore.people.first(where: { $0.id == id })
        else { return nil }
        return peopleStore.details(for: person)?.name ?? person.cachedName
    }

    /// From the Daily planner: remove this day's block only. From the
    /// Goals page: delete the goal.
    @ViewBuilder
    private var removeOrDeleteButton: some View {
        if let day = openedFromDay {
            VStack(alignment: .leading, spacing: 6) {
                Button("Remove from \(day.formatted(.dateTime.weekday(.wide).day().month(.wide)))") {
                    store.removeBlock(goal.id, on: day)
                    dismiss()
                }
                .buttonStyle(VectisButtonStyle(kind: .destructive))
                editorNote("Takes it off the calendar for this day only. The goal and its other days stay — delete the goal from the Goals page.")
            }
            .padding(.top, 4)
        } else {
            Button("Delete goal") {
                store.deleteGoal(goal.id)
                dismiss()
            }
            .buttonStyle(VectisButtonStyle(kind: .destructive))
            .padding(.top, 4)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    EditorTitleBox(label: "Name", placeholder: "e.g. Read 30 minutes", text: $goal.title, accent: accentColor)
                    trackingBox

                    EditorBox(title: "Duration", accent: accentColor) {
                        VStack(spacing: 10) {
                            GoalDatePicker(date: $goal.endDate, toggleLabel: "Set a duration", dateLabel: "Ends on", accent: accentColor)
                        }
                        .font(.subheadline)
                    }

                    plannerBox

                    Button {
                        showingAppPicker = true
                    } label: {
                        EditorSummaryRow(title: "Linked app", summary: goal.linkedAppName ?? "None")
                    }
                    .buttonStyle(.plain)
                    editorNote("Opens straight from the goal. Planner asks how it went when you come back, rather than assuming.")

                    Button {
                        showingPersonPicker = true
                    } label: {
                        EditorSummaryRow(title: "Linked person", summary: linkedPersonName ?? "None")
                    }
                    .buttonStyle(.plain)
                    editorNote("For goals like calling someone regularly. Their contact actions appear on the goal.")

                    removeOrDeleteButton
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Edit goal")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingPersonPicker) {
                PersonPickerSheet(peopleStore: peopleStore, selection: $goal.linkedPersonID)
            }
            .sheet(isPresented: $showingAppPicker) {
                AppPickerSheet(linkedAppsStore: linkedAppsStore) { scheme, name, appID in
                    if scheme.isEmpty {
                        goal.linkedAppScheme = nil
                        goal.linkedAppName = nil
                        goal.linkedAppID = nil
                    } else {
                        goal.linkedAppScheme = scheme
                        goal.linkedAppName = name
                        goal.linkedAppID = appID
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var finalGoal = goal
                        let scheduleChanged = originalRepeatDays != finalGoal.repeatDays
                            || originalScheduledStartMinutes != finalGoal.scheduledStartMinutes
                            || originalScheduledDurationMinutes != finalGoal.scheduledDurationMinutes

                        if scheduleChanged {
                            // The version records what was true BEFORE
                            // this edit — the originals captured when
                            // the sheet opened — stamped with when that
                            // old schedule had been in effect since.
                            // `goal`'s own fields already hold the new
                            // values, which is exactly what should be
                            // live from today onward.
                            finalGoal.scheduleVersions.append(ScheduleVersion(
                                effectiveFrom: finalGoal.currentScheduleEffectiveFrom,
                                repeatDays: originalRepeatDays,
                                startMinutes: originalScheduledStartMinutes,
                                durationMinutes: originalScheduledDurationMinutes
                            ))
                            finalGoal.currentScheduleEffectiveFrom = Calendar.current.startOfDay(for: Date())
                        }

                        store.updateGoal(finalGoal)
                        dismiss()
                    }
                    .disabled(goal.repeatDays.isEmpty)
                }
            }
        }
    }

    private func editorNote(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }

    private var trackingNote: String {
        switch goal.frequencyType {
        case .specificDays:
            return "Tracks a streak of specific weekdays, like Monday/Wednesday/Friday."
        case .timesPerWeek:
            return "Any days count, up to the weekly target — good for things like \"workout 3 times a week\" that don't need to land on set days."
        case .timesPerDay:
            return "Tracks multiple completions in one day, like drinking water 4 times."
        }
    }

    private var trackingBox: some View {
        EditorBox(title: "Track by", accent: accentColor) {
            VStack(alignment: .leading, spacing: 12) {
                UnderlineSelector(
                    options: [
                        (value: GoalFrequencyType.specificDays, label: "Specific days"),
                        (value: .timesPerWeek, label: "Times a week"),
                        (value: .timesPerDay, label: "Times a day")
                    ],
                    selection: $goal.frequencyType,
                    accent: accentColor,
                    verticalPadding: 8
                )

                switch goal.frequencyType {
                case .specificDays:
                    RepeatDaysPicker(repeatDays: $goal.repeatDays, accent: accentColor)
                case .timesPerWeek:
                    Stepper("\(goal.timesPerWeekTarget) times a week", value: $goal.timesPerWeekTarget, in: 1...14)
                        .font(.subheadline)
                case .timesPerDay:
                    Stepper("\(goal.timesPerDayTarget) times a day", value: $goal.timesPerDayTarget, in: 1...20)
                        .font(.subheadline)
                }

                Text(trackingNote)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The goal's start time as a Date, for the time picker — the goal
    /// itself stores minutes from midnight.
    private var startTimeBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(
                    bySettingHour: goal.scheduledStartMinutes / 60,
                    minute: goal.scheduledStartMinutes % 60,
                    second: 0,
                    of: Date()
                ) ?? Date()
            },
            set: { newDate in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newDate)
                goal.scheduledStartMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
            }
        )
    }

    private var plannerBox: some View {
        EditorBox(title: "On the daily planner", accent: accentColor) {
            VStack(alignment: .leading, spacing: 10) {
                Toggle("Add to calendar", isOn: $goal.scheduledOnCalendar)
                    .font(.subheadline)

                if goal.scheduledOnCalendar {
                    HStack(spacing: 10) {
                        EditorTimeField(label: "Starts", selection: startTimeBinding)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Length")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Picker("Length", selection: $goal.scheduledDurationMinutes) {
                                Text("15 min").tag(15)
                                Text("30 min").tag(30)
                                Text("45 min").tag(45)
                                Text("1 hour").tag(60)
                                Text("1½ hours").tag(90)
                                Text("2 hours").tag(120)
                            }
                            .labelsHidden()
                            .tint(accentColor)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                                .fill(Color(.tertiarySystemGroupedBackground))
                        )
                    }

                    Text("Shows at \(goal.scheduledTimeText) on your daily planner, on the days set above.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Toggle("Flexible", isOn: $goal.isFlexible)
                        .font(.subheadline)
                    Text("On means Plan and Review can nudge this around the day. Off treats it like a fixed appointment.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Blocks out time for this goal on the daily planner. Tap the block to tick the goal off for that day.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

