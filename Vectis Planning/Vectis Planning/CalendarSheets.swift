import SwiftUI

/// Handles both creating and editing an event — same form either way,
/// just started from a different initializer.
struct EventEditorSheet: View {
    @ObservedObject var store: CalendarStore
    @ObservedObject var peopleStore: PeopleStore
    @ObservedObject var goalsStore: GoalsStore
    let originalEvent: CalendarEvent?

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var categoryID: UUID?
    @State private var start: Date
    @State private var end: Date
    @State private var isAllDay: Bool
    @State private var flowsToDaily: Bool
    @State private var recurrence: EventRecurrence
    @State private var recurrenceEndDate: Date?
    @State private var repeatDays: Set<Int>
    @State private var linkedPersonID: UUID?
    @State private var linkedGoalID: UUID?

    @State private var showingPersonPicker = false
    @State private var showingDeleteOptions = false

    /// Which screen this editor was opened from. Carried through to the
    /// saved event so Long-Term knows what belongs to it, independent of
    /// whether the event also shows on the Daily grid.
    private let origin: EventOrigin
    @State private var showingGoalPicker = false

    /// Tracks whether the user has deliberately overridden the daily
    /// toggle. Until they do, it follows the all-day switch
    /// automatically — a timed event belongs on the daily planner, an
    /// all-day one doesn't.
    @State private var userSetDailyManually = false

    private var linkedPersonName: String? {
        guard let id = linkedPersonID,
              let person = peopleStore.people.first(where: { $0.id == id })
        else { return nil }
        return peopleStore.details(for: person)?.name ?? person.cachedName
    }

    private var linkedGoalName: String? {
        guard let id = linkedGoalID else { return nil }
        return goalsStore.goals.first { $0.id == id }?.title
    }

    /// For creating a brand-new event.
    ///
    /// `defaultAllDay` is what makes adding from the Long-Term calendar
    /// behave the way you'd expect: it starts as an all-day entry, and
    /// only becomes a timed daily-planner event once you give it times.
    init(
        store: CalendarStore,
        peopleStore: PeopleStore,
        goalsStore: GoalsStore,
        date: Date,
        startMinutes: Int,
        endMinutes: Int,
        flowsToDaily: Bool = true,
        defaultAllDay: Bool = false,
        origin: EventOrigin = .daily
    ) {
        self.store = store
        self.peopleStore = peopleStore
        self.goalsStore = goalsStore
        self.originalEvent = nil
        self.origin = origin
        let dayStart = Calendar.current.startOfDay(for: date)
        _title = State(initialValue: "")
        _categoryID = State(initialValue: store.categories.first?.id)
        _start = State(initialValue: dayStart.addingTimeInterval(TimeInterval(startMinutes * 60)))
        _end = State(initialValue: dayStart.addingTimeInterval(TimeInterval(endMinutes * 60)))
        _isAllDay = State(initialValue: defaultAllDay)
        _flowsToDaily = State(initialValue: defaultAllDay ? false : flowsToDaily)
        _recurrence = State(initialValue: .none)
        _recurrenceEndDate = State(initialValue: nil)
        _repeatDays = State(initialValue: Set(1...7))
        _linkedPersonID = State(initialValue: nil)
        _linkedGoalID = State(initialValue: nil)
    }

    /// For editing an event that already exists.
    init(store: CalendarStore, peopleStore: PeopleStore, goalsStore: GoalsStore, editing event: CalendarEvent) {
        self.store = store
        self.peopleStore = peopleStore
        self.goalsStore = goalsStore
        self.originalEvent = event
        self.origin = event.origin
        _title = State(initialValue: event.title)
        _categoryID = State(initialValue: event.categoryID)
        _start = State(initialValue: event.startDate)
        _end = State(initialValue: event.endDate)
        _isAllDay = State(initialValue: event.isAllDay)
        _flowsToDaily = State(initialValue: event.flowsToDaily)
        _recurrence = State(initialValue: event.recurrence)
        _recurrenceEndDate = State(initialValue: event.recurrenceEndDate)
        _repeatDays = State(initialValue: event.repeatDays)
        _linkedPersonID = State(initialValue: event.linkedPersonID)
        _linkedGoalID = State(initialValue: event.linkedGoalID)
        _userSetDailyManually = State(initialValue: true)
    }

    private var isEditing: Bool { originalEvent != nil }

    private var spanDescription: String? {
        let calendar = Calendar.current
        let days = (calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: start),
            to: calendar.startOfDay(for: end)
        ).day ?? 0) + 1
        return days > 1 ? "Spans \(days) days" : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    Picker("Category", selection: $categoryID) {
                        ForEach(store.categories) { category in
                            Text(category.name).tag(Optional(category.id))
                        }
                    }
                }

                Section {
                    Toggle("All day", isOn: $isAllDay)
                        .onChange(of: isAllDay) { _, nowAllDay in
                            // An all-day event has no slot on the daily
                            // grid, so it comes off it. Turning all-day
                            // back off puts it back — unless you've
                            // already overridden that yourself.
                            if !userSetDailyManually {
                                flowsToDaily = !nowAllDay
                            }
                        }

                    DatePicker(
                        isAllDay ? "Starts" : "Start",
                        selection: $start,
                        displayedComponents: isAllDay ? .date : [.date, .hourAndMinute]
                    )
                    DatePicker(
                        isAllDay ? "Ends" : "End",
                        selection: $end,
                        displayedComponents: isAllDay ? .date : [.date, .hourAndMinute]
                    )

                    if let span = spanDescription {
                        Text(span)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Set the end to a later date for something that runs across several days, like a holiday.")
                }

                Section {
                    Picker("Repeats", selection: $recurrence) {
                        ForEach(EventRecurrence.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }

                    if recurrence == .daily {
                        // Same picker the goals use, so narrowing a
                        // repeat to weekdays works identically in both
                        // places rather than being two similar features.
                        RepeatDaysPicker(repeatDays: $repeatDays)
                    }

                    if recurrence != .none {
                        Toggle("Stops repeating", isOn: Binding(
                            get: { recurrenceEndDate != nil },
                            set: { on in
                                recurrenceEndDate = on
                                    ? Calendar.current.date(byAdding: .month, value: 3, to: end)
                                    : nil
                            }
                        ))
                        if recurrenceEndDate != nil {
                            DatePicker(
                                "Until",
                                selection: Binding(
                                    get: { recurrenceEndDate ?? end },
                                    set: { recurrenceEndDate = $0 }
                                ),
                                displayedComponents: .date
                            )
                        }
                    }
                } footer: {
                    if recurrence != .none {
                        Text("Repeating events can't be dragged on the daily planner — change the time here instead, so the whole series moves together.")
                    }
                }

                Section {
                    Toggle("Show on Daily planner", isOn: $flowsToDaily)
                        .onChange(of: flowsToDaily) { _, _ in
                            userSetDailyManually = true
                        }
                        .disabled(isAllDay)
                } footer: {
                    if isAllDay {
                        Text("All-day events don't appear on the daily planner — there's no time slot for them.")
                    }
                }

                Section("Links") {
                    Button {
                        showingGoalPicker = true
                    } label: {
                        HStack {
                            Text("Goal").foregroundStyle(.primary)
                            Spacer()
                            Text(linkedGoalName ?? "None").foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    Button {
                        showingPersonPicker = true
                    } label: {
                        HStack {
                            Text("Person").foregroundStyle(.primary)
                            Spacer()
                            Text(linkedPersonName ?? "None").foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    if let personID = linkedPersonID {
                        ContactActionsRow(
                            personID: personID,
                            peopleStore: peopleStore,
                            accentColor: .accentColor
                        )
                    }
                }

                if let original = originalEvent {
                    Section {
                        Button("Delete event", role: .destructive) {
                            if original.recurrence != .none {
                                // A repeating event needs the person to
                                // choose: skip today's occurrence only,
                                // or remove the whole series. Deleting
                                // outright with no choice was the bug —
                                // "I don't want to do this today" and "I
                                // never want to do this again" are very
                                // different requests.
                                showingDeleteOptions = true
                            } else {
                                store.deleteEvent(original.id)
                                dismiss()
                            }
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit event" : "New event")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingPersonPicker) {
                PersonPickerSheet(peopleStore: peopleStore, selection: $linkedPersonID)
            }
            .sheet(isPresented: $showingGoalPicker) {
                EventGoalPickerSheet(goalsStore: goalsStore, selection: $linkedGoalID)
            }
            .confirmationDialog(
                "This is a repeating event",
                isPresented: $showingDeleteOptions,
                titleVisibility: .visible
            ) {
                Button("Delete just this occurrence") {
                    if let original = originalEvent {
                        // Uses the original occurrence's own date, not
                        // whatever the form's date fields currently say
                        // — so if the time got edited before tapping
                        // Delete, the right day still gets excluded.
                        store.deleteOccurrence(eventID: original.id, date: original.startDate)
                    }
                    dismiss()
                }
                Button("Delete all occurrences", role: .destructive) {
                    if let original = originalEvent {
                        store.deleteEvent(original.id)
                    }
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Delete just this one, or the whole series?")
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Add") { save() }
                }
            }
        }
    }

    private func save() {
        guard let categoryID else { return }
        let resolvedTitle = title.trimmingCharacters(in: .whitespaces).isEmpty ? "New event" : title

        // Normalise an all-day event to cover whole days, so it lines up
        // cleanly on the month grid rather than starting mid-afternoon.
        var resolvedStart = start
        var resolvedEnd = end
        if isAllDay {
            let calendar = Calendar.current
            resolvedStart = calendar.startOfDay(for: start)
            resolvedEnd = calendar.date(bySettingHour: 23, minute: 59, second: 0, of: end) ?? end
        }
        // Guard against an end before the start, which would render as
        // a negative-height block.
        if resolvedEnd < resolvedStart { resolvedEnd = resolvedStart.addingTimeInterval(1800) }

        if var updated = originalEvent {
            updated.title = resolvedTitle
            updated.categoryID = categoryID
            updated.startDate = resolvedStart
            updated.endDate = resolvedEnd
            updated.isAllDay = isAllDay
            updated.flowsToDaily = isAllDay ? false : flowsToDaily
            updated.recurrence = recurrence
            updated.recurrenceEndDate = recurrenceEndDate
            updated.repeatDays = repeatDays
            updated.linkedPersonID = linkedPersonID
            updated.linkedGoalID = linkedGoalID
            updated.origin = origin
            store.updateEvent(updated)
        } else {
            var event = CalendarEvent(
                title: resolvedTitle,
                startDate: resolvedStart,
                endDate: resolvedEnd,
                categoryID: categoryID,
                flowsToDaily: isAllDay ? false : flowsToDaily
            )
            event.isAllDay = isAllDay
            event.recurrence = recurrence
            event.recurrenceEndDate = recurrenceEndDate
            event.repeatDays = repeatDays
            event.linkedPersonID = linkedPersonID
            event.linkedGoalID = linkedGoalID
            event.origin = origin
            store.addEvent(event)
        }

        // Dismissing on the very next run loop tick, rather than
        // immediately, gives the store's @Published update time to
        // finish propagating before the dismiss animation starts
        // competing for the same run loop. Without this, a save
        // occasionally doesn't show up until you interact with the
        // calendar again — the data was saved, the view just hadn't
        // redrawn yet when the sheet closed.
        DispatchQueue.main.async {
            dismiss()
        }
    }
}

/// Picking which goal an event relates to. Offers every goal — long
/// term, standalone short-term, and habits nested under a long-term
/// goal, labelled with their parent so they stay tellable apart.
struct EventGoalPickerSheet: View {
    @ObservedObject var goalsStore: GoalsStore
    @Binding var selection: UUID?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        selection = nil
                        dismiss()
                    } label: {
                        HStack {
                            Text("None").foregroundStyle(.primary)
                            Spacer()
                            if selection == nil {
                                Image(systemName: "checkmark").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !goalsStore.longTermGoals.isEmpty {
                    Section("Long-term") {
                        ForEach(goalsStore.longTermGoals) { goal in
                            row(goal.id, goal.title)
                        }
                    }
                }

                if !goalsStore.standaloneShortTermGoals.isEmpty {
                    Section("Short-term") {
                        ForEach(goalsStore.standaloneShortTermGoals) { goal in
                            row(goal.id, goal.title)
                        }
                    }
                }

                let nested = goalsStore.goals.filter { $0.linkedToGoalID != nil }
                if !nested.isEmpty {
                    Section("Daily habits") {
                        ForEach(nested) { habit in
                            row(habit.id, habitLabel(habit))
                        }
                    }
                }
            }
            .navigationTitle("Link a goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func row(_ id: UUID, _ label: String) -> some View {
        Button {
            selection = id
            dismiss()
        } label: {
            HStack {
                Text(label).foregroundStyle(.primary)
                Spacer()
                if selection == id {
                    Image(systemName: "checkmark").foregroundStyle(.secondary)
                }
            }
        }
    }

    private func habitLabel(_ habit: Goal) -> String {
        guard let parentID = habit.linkedToGoalID,
              let parent = goalsStore.goals.first(where: { $0.id == parentID })
        else { return habit.title }
        return "\(habit.title) (\(parent.title))"
    }
}

