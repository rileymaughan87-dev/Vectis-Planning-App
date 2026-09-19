import SwiftUI

/// A row of tappable day circles (Sun–Sat) plus "Every day / Weekdays /
/// Weekends" shortcuts, bound directly to a goal's `repeatDays`.
///
/// Pulled out as its own View so the creation form and the editor both
/// use the exact same picker rather than two separate copies that could
/// quietly drift apart over time.
struct RepeatDaysPicker: View {
    @Binding var repeatDays: Set<Int>

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
                .background(isOn ? Color.accentColor : Color.secondary.opacity(0.15))
                .foregroundStyle(isOn ? Color.white : Color.primary)
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
        .foregroundStyle(Color.accentColor)
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
        .foregroundStyle(Color.accentColor)
        .frame(maxWidth: .infinity)
    }
}

/// Adding a standalone short-term goal. Deliberately has no way to link
/// it to a long-term goal here — that only happens from inside the
/// long-term goal's own editor, so there's exactly one place a link can
/// be created, per what we decided when designing this.
struct AddShortTermGoalSheet: View {
    @ObservedObject var store: GoalsStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var repeatDays: Set<Int> = Goal.allDays
    @State private var endDate: Date?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    Text("To tie a habit to a long-term goal, add it from within that goal instead.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Repeats on") {
                    RepeatDaysPicker(repeatDays: $repeatDays)
                }

                Section("Duration") {
                    GoalDatePicker(date: $endDate, toggleLabel: "Set a duration", dateLabel: "Ends on")
                }
            }
            .navigationTitle("Add short-term goal")
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
            Form {
                Section("Name") {
                    TextField("Name", text: $goal.title)
                }

                Section("Target date") {
                    GoalDatePicker(date: $goal.targetDate, toggleLabel: "Set a target date", dateLabel: "Complete by")
                }

                Section("Milestones") {
                    // The `$` here gives us a Binding to each milestone in
                    // the array, so edits inside the row (the toggle, the
                    // text field, the date picker) write straight back into
                    // `goal.milestones` without any extra plumbing.
                    ForEach($goal.milestones) { $milestone in
                        milestoneRow($milestone)
                    }
                    .onDelete { indexSet in
                        goal.milestones.remove(atOffsets: indexSet)
                    }

                    Button {
                        goal.milestones.append(Milestone(title: ""))
                    } label: {
                        Label("Add milestone", systemImage: "plus")
                    }
                }

                Section("Daily habits") {
                    let linked = store.linkedGoals(for: goal.id)
                    if linked.isEmpty {
                        Text("No daily habits linked yet.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(linked) { habit in
                        Text(habit.title)
                    }

                    HStack {
                        TextField("e.g. Study 1 hour", text: $newHabitName)
                        Button("Add") {
                            addHabit()
                        }
                        .disabled(newHabitName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                // Only when editing — during creation, Cancel already
                // discards everything, so a Delete button would be
                // redundant and slightly confusing.
                if !isNewCreation {
                    Section {
                        Button("Delete goal", role: .destructive) {
                            store.deleteGoal(goal.id)
                            dismiss()
                        }
                    } footer: {
                        Text("Any daily habits linked to this goal will be deleted too.")
                    }
                }
            }
            .navigationTitle(isNewCreation ? "New goal" : "Edit goal")
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

    @ViewBuilder
    private func milestoneRow(_ milestone: Binding<Milestone>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Button {
                    milestone.wrappedValue.done.toggle()
                } label: {
                    CompletionMark(isOn: milestone.wrappedValue.done, size: 20, color: accentColor)
                }
                .buttonStyle(.plain)
                TextField("Milestone name", text: milestone.title)
            }
            Toggle("Add to calendar", isOn: milestone.addToCalendar)
            if milestone.wrappedValue.addToCalendar {
                DatePicker(
                    "Date",
                    selection: Binding(
                        get: { milestone.wrappedValue.date ?? Date() },
                        set: { milestone.wrappedValue.date = $0 }
                    ),
                    displayedComponents: .date
                )
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

    init(goal: Goal, store: GoalsStore, linkedAppsStore: LinkedAppsStore, peopleStore: PeopleStore) {
        _goal = State(initialValue: goal)
        self.store = store
        self.linkedAppsStore = linkedAppsStore
        self.peopleStore = peopleStore
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Name", text: $goal.title)
                }

                Section {
                    Picker("Track by", selection: $goal.frequencyType) {
                        Text("Specific days").tag(GoalFrequencyType.specificDays)
                        Text("Times per week").tag(GoalFrequencyType.timesPerWeek)
                        Text("Times per day").tag(GoalFrequencyType.timesPerDay)
                    }

                    switch goal.frequencyType {
                    case .specificDays:
                        RepeatDaysPicker(repeatDays: $goal.repeatDays)

                    case .timesPerWeek:
                        Stepper(
                            "\(goal.timesPerWeekTarget) times a week",
                            value: $goal.timesPerWeekTarget,
                            in: 1...14
                        )

                    case .timesPerDay:
                        Stepper(
                            "\(goal.timesPerDayTarget) times a day",
                            value: $goal.timesPerDayTarget,
                            in: 1...20
                        )
                    }
                } footer: {
                    switch goal.frequencyType {
                    case .specificDays:
                        Text("Tracks a streak of specific weekdays, like Monday/Wednesday/Friday.")
                    case .timesPerWeek:
                        Text("Any days count, up to the weekly target — good for things like \"workout 3 times a week\" that don't need to land on set days.")
                    case .timesPerDay:
                        Text("Tracks multiple completions in one day, like drinking water 4 times.")
                    }
                }

                Section("Duration") {
                    GoalDatePicker(date: $goal.endDate, toggleLabel: "Set a duration", dateLabel: "Ends on")
                }

                Section {
                    Toggle("Add to calendar", isOn: $goal.scheduledOnCalendar)

                    if goal.scheduledOnCalendar {
                        DatePicker(
                            "Start time",
                            selection: Binding(
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
                            ),
                            displayedComponents: .hourAndMinute
                        )

                        Picker("Length", selection: $goal.scheduledDurationMinutes) {
                            Text("15 min").tag(15)
                            Text("30 min").tag(30)
                            Text("45 min").tag(45)
                            Text("1 hour").tag(60)
                            Text("1½ hours").tag(90)
                            Text("2 hours").tag(120)
                        }

                        Text("Shows at \(goal.scheduledTimeText) on your daily planner, on the days set above.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Toggle("Flexible", isOn: $goal.isFlexible)
                        Text("On means Plan and Review can nudge this around the day. Off treats it like a fixed appointment.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Blocks out time for this goal on the daily planner. Tap the block to tick the goal off for that day.")
                }

                Section {
                    Button {
                        showingAppPicker = true
                    } label: {
                        HStack {
                            Text("Linked app")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(goal.linkedAppName ?? "None")
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("Opens straight from the goal. Vectis asks how it went when you come back, rather than assuming.")
                }

                Section {
                    Button {
                        showingPersonPicker = true
                    } label: {
                        HStack {
                            Text("Linked person")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(linkedPersonName ?? "None")
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("For goals like calling someone regularly. Their contact actions appear on the goal.")
                }

                Section {
                    Button("Delete goal", role: .destructive) {
                        store.deleteGoal(goal.id)
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit goal")
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
}

