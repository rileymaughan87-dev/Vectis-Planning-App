import SwiftUI

// MARK: - Event editor

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
    @State private var isFlexible: Bool
    @State private var flowsToDaily: Bool
    @State private var recurrence: EventRecurrence
    @State private var recurrenceEndDate: Date?
    @State private var repeatDays: Set<Int>
    @State private var linkedPersonID: UUID?
    @State private var linkedGoalID: UUID?

    @State private var showingPersonPicker = false
    @State private var showingDeleteOptions = false
    @State private var showingTimeScope = false
    @State private var parts: [EventPart] = []
    @State private var loggingActual = false
    @State private var loggedMinutes = 30

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
        _isFlexible = State(initialValue: false)
        _flowsToDaily = State(initialValue: defaultAllDay ? false : flowsToDaily)
        _recurrence = State(initialValue: .none)
        _recurrenceEndDate = State(initialValue: nil)
        _repeatDays = State(initialValue: Set(1...7))
        _parts = State(initialValue: [])
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
        _isFlexible = State(initialValue: event.isFlexible)
        _flowsToDaily = State(initialValue: event.flowsToDaily)
        _recurrence = State(initialValue: event.recurrence)
        _recurrenceEndDate = State(initialValue: event.recurrenceEndDate)
        _repeatDays = State(initialValue: event.repeatDays)
        _parts = State(initialValue: event.parts)
        let loggedSoFar = event.recurrence == .none
            ? event.actualMinutes
            : event.occurrenceActuals[Goal.dayKey(event.startDate)]
        _loggedMinutes = State(initialValue: loggedSoFar ?? max(Int(event.endDate.timeIntervalSince(event.startDate) / 60), 5))
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

    /// The parts summing longer than the block is the EXPECTED result
    /// of breaking a task down, not an error — see the note on `parts`
    /// in CalendarModels. So this never silently compresses or grows
    /// anything; it states the gap and offers an explicit choice.
    /// Only offered for an existing, timed event whose start time has
    /// already passed — there's nothing to log for a new event, an
    /// all-day one, or something that hasn't happened yet. For a
    /// repeating event, it logs the occurrence that was opened.
    private var canLogActual: Bool {
        guard let event = originalEvent, !isAllDay else { return false }
        return Date() >= event.startDate
    }

    /// What's logged right now, read live from the store — the event this
    /// editor opened with is a snapshot, so it wouldn't show a log made
    /// a moment ago.
    private var currentLoggedMinutes: Int? {
        guard let original = originalEvent,
              let live = store.events.first(where: { $0.id == original.id }) else { return nil }
        return original.recurrence == .none
            ? live.actualMinutes
            : live.occurrenceActuals[Goal.dayKey(original.startDate)]
    }


    private var accentColor: Color {
        guard let categoryID,
              let category = store.categories.first(where: { $0.id == categoryID })
        else { return .vectisBlue }
        return Color(hex: category.colorHex)
    }

    private var durationText: String {
        let minutes = max(Int(end.timeIntervalSince(start) / 60), 0)
        let h = minutes / 60
        let m = minutes % 60
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    private var repeatsSummary: String {
        switch recurrence {
        case .none: return "Never"
        case .weekly: return "Every week"
        case .monthly: return "Every month"
        case .daily:
            if repeatDays.count == 7 { return "Every day" }
            if repeatDays == Set([2, 3, 4, 5, 6]) { return "Weekdays" }
            if repeatDays == Set([1, 7]) { return "Weekends" }
            return "\(repeatDays.count) days a week"
        }
    }

    private var partsSummaryText: String {
        guard !parts.isEmpty else { return "None" }
        let total = parts.reduce(0) { $0 + $1.estimatedMinutes }
        let h = total / 60
        let m = total % 60
        let time = h == 0 ? "\(m)m" : (m == 0 ? "\(h)h" : "\(h)h \(m)m")
        return "\(parts.count) part\(parts.count == 1 ? "" : "s") · \(time)"
    }

    private var linksSummary: String {
        var bits: [String] = []
        if let name = linkedGoalName { bits.append(name) }
        if let name = linkedPersonName { bits.append(name) }
        return bits.isEmpty ? "None" : bits.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    titleBox
                    whenBox
                    categoryBox

                    NavigationLink {
                        RepeatsDetailView(
                            recurrence: $recurrence,
                            repeatDays: $repeatDays,
                            recurrenceEndDate: $recurrenceEndDate,
                            fallbackEndDate: end
                        )
                    } label: {
                        EditorSummaryRow(title: "Repeats", summary: repeatsSummary)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        PartsDetailView(parts: $parts, end: $end, start: start)
                    } label: {
                        EditorSummaryRow(title: "Break into parts", summary: partsSummaryText)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        LinksDetailView(
                            peopleStore: peopleStore,
                            goalsStore: goalsStore,
                            linkedGoalID: $linkedGoalID,
                            linkedPersonID: $linkedPersonID
                        )
                    } label: {
                        EditorSummaryRow(title: "Links", summary: linksSummary)
                    }
                    .buttonStyle(.plain)

                    actionsRow
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(isEditing ? "Edit event" : "New event")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog(
                "This is a repeating event",
                isPresented: $showingDeleteOptions,
                titleVisibility: .visible
            ) {
                Button("Delete just this occurrence") {
                    if let original = originalEvent {
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
            // Asked only when the time of one day of a repeating event
            // changed. Everything else (title, category…) always applies
            // to the whole series.
            .confirmationDialog(
                "This is a repeating event",
                isPresented: $showingTimeScope,
                titleVisibility: .visible
            ) {
                Button("This day only") { save(timeScope: .thisDay) }
                Button("This and all future days") { save(timeScope: .future) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Change the time for just this day, or from now on? Earlier days keep the times they had.")
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

    private var titleBox: some View {
        EditorTitleBox(placeholder: "New event", text: $title, accent: accentColor)
    }

    /// Moves BOTH start and end by the same number of days, preserving
    /// each one's time of day — and preserving any existing gap between
    /// them, so nudging the date on a multi-day event keeps its span
    /// rather than collapsing it back to one day.
    private var sharedDateBinding: Binding<Date> {
        Binding(
            get: { start },
            set: { newDate in
                let calendar = Calendar.current
                let dayDelta = calendar.dateComponents(
                    [.day],
                    from: calendar.startOfDay(for: start),
                    to: calendar.startOfDay(for: newDate)
                ).day ?? 0
                guard dayDelta != 0 else { return }
                if let shifted = calendar.date(byAdding: .day, value: dayDelta, to: start) {
                    start = shifted
                }
                if let shifted = calendar.date(byAdding: .day, value: dayDelta, to: end) {
                    end = shifted
                }
            }
        )
    }

    /// Just the clock-time portion of `start`/`end`, independent of the
    /// date — what the paired fields below actually edit, so they show
    /// "10:00 am" rather than a full date-and-time string that's too
    /// wide to fit two across.
    private func timeOnlyBinding(for date: Binding<Date>) -> Binding<Date> {
        Binding(
            get: { date.wrappedValue },
            set: { newTime in
                let calendar = Calendar.current
                let comps = calendar.dateComponents([.hour, .minute], from: newTime)
                if let updated = calendar.date(
                    bySettingHour: comps.hour ?? 0,
                    minute: comps.minute ?? 0,
                    second: 0,
                    of: date.wrappedValue
                ) {
                    date.wrappedValue = updated
                }
            }
        )
    }

    private var whenBox: some View {
        EditorBox(title: "When", accent: accentColor, trailing: isAllDay ? nil : durationText) {
            VStack(spacing: 10) {
                if isAllDay {
                    DatePicker("Starts", selection: $start, displayedComponents: .date)
                    DatePicker("Ends", selection: $end, displayedComponents: .date)
                } else {
                    // The date shown once, since a timed event is
                    // almost always same-day — showing it twice (once
                    // per field) was what made the paired row too wide
                    // to fit. The two fields below edit clock time only.
                    DatePicker("Date", selection: sharedDateBinding, displayedComponents: .date)
                    HStack(spacing: 10) {
                        timeField("Starts", selection: timeOnlyBinding(for: $start))
                        timeField("Ends", selection: timeOnlyBinding(for: $end))
                    }
                }

                if let span = spanDescription {
                    HStack {
                        Text(span)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                }

                Toggle("All day", isOn: $isAllDay)
                    .font(.subheadline)
                    .onChange(of: isAllDay) { _, nowAllDay in
                        if !userSetDailyManually {
                            flowsToDaily = !nowAllDay
                        }
                    }

                if !isAllDay {
                    Toggle("Show on Daily planner", isOn: $flowsToDaily)
                        .font(.subheadline)
                        .onChange(of: flowsToDaily) { _, _ in
                            userSetDailyManually = true
                        }

                    Toggle("Flexible", isOn: $isFlexible)
                        .font(.subheadline)
                    Text("Off means this is a real commitment — Plan and Review will build the day around it rather than moving it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func timeField(_ label: String, selection: Binding<Date>) -> some View {
        EditorTimeField(label: label, selection: selection)
    }

    private var categoryBox: some View {
        EditorBox(title: "Category", accent: accentColor) {
            CategoryChips(categories: store.categories, selection: $categoryID)
        }
    }

    @ViewBuilder
    private var actionsRow: some View {
        if canLogActual {
            logActualBox
        }
        if originalEvent != nil {
            Button {
                if let original = originalEvent, original.recurrence != .none {
                    showingDeleteOptions = true
                } else if let original = originalEvent {
                    store.deleteEvent(original.id)
                    dismiss()
                }
            } label: {
                Text("Delete event")
            }
            .buttonStyle(VectisButtonStyle(kind: .destructive))
            .padding(.top, 4)
        }
    }

    @ViewBuilder
    private var logActualBox: some View {
        EditorBox(title: "Time taken", accent: accentColor) {
            VStack(spacing: 10) {
                if loggingActual {
                    Stepper(
                        "\(loggedMinutes / 60 > 0 ? "\(loggedMinutes / 60)h " : "")\(loggedMinutes % 60)m",
                        value: $loggedMinutes,
                        in: 5...600,
                        step: 5
                    )
                    .font(.subheadline)
                    HStack(spacing: 8) {
                        Button("Log it") {
                            guard let event = originalEvent else { return }
                            if event.recurrence == .none {
                                let newEnd = event.startDate.addingTimeInterval(TimeInterval(loggedMinutes * 60))
                                store.resizeEvent(event.id, newEnd: newEnd)
                                // Keep the editor's End in step, so tapping
                                // Save afterwards doesn't put the old end back.
                                end = newEnd
                            } else {
                                store.logOccurrenceActual(eventID: event.id, date: event.startDate, minutes: loggedMinutes)
                            }
                            loggingActual = false
                        }
                        .buttonStyle(VectisButtonStyle(kind: .primary, accent: accentColor))

                        Button("Cancel") { loggingActual = false }
                            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))
                    }
                } else {
                    Button {
                        loggingActual = true
                    } label: {
                        Text(currentLoggedMinutes != nil ? "Update logged time" : "Log actual time")
                    }
                    .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))

                    if let actual = currentLoggedMinutes {
                        HStack {
                            Text("Logged: \(actual) min")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                    }
                }
            }
        }
    }


    private enum TimeScope { case thisDay, future }

    /// `timeScope` is nil on the first tap of Save. If a repeating
    /// event's time changed, Save stops and asks, then runs again with
    /// the answer — before anything has been written.
    private func save(timeScope: TimeScope? = nil) {
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
            // What the editor was opened with. For a REPEATING event,
            // this is the occurrence's display-shifted time — NOT the
            // series' real anchor time. Saving that back as the
            // event's actual startDate/endDate would silently corrupt
            // the whole series' anchor, which is exactly the bug this
            // branch exists to avoid.
            let original = updated

            if original.recurrence != .none {
                // Look up the TRUE series event fresh from the store,
                // rather than trusting `updated` — which was built from
                // the occurrence-shifted copy — for anything date-related.
                guard var series = store.events.first(where: { $0.id == original.id }) else { return }

                // Times are compared as time of day and length, so this
                // works on any occurrence, not just the series' first.
                let calendar = Calendar.current
                let occurrenceDay = calendar.startOfDay(for: original.startDate)
                let originalComps = calendar.dateComponents([.hour, .minute], from: original.startDate)
                let newComps = calendar.dateComponents([.hour, .minute], from: resolvedStart)
                let originalStartMinutes = (originalComps.hour ?? 0) * 60 + (originalComps.minute ?? 0)
                let newStartMinutes = (newComps.hour ?? 0) * 60 + (newComps.minute ?? 0)
                let originalMinutes = Int(original.endDate.timeIntervalSince(original.startDate) / 60)
                let newMinutes = Int(resolvedEnd.timeIntervalSince(resolvedStart) / 60)
                let timesChanged = !isAllDay
                    && (newStartMinutes != originalStartMinutes || newMinutes != originalMinutes)

                guard !timesChanged || timeScope != nil else {
                    showingTimeScope = true
                    return
                }

                series.title = resolvedTitle
                series.categoryID = categoryID
                series.isAllDay = isAllDay
                series.flowsToDaily = isAllDay ? false : flowsToDaily
                series.recurrence = recurrence
                series.recurrenceEndDate = recurrenceEndDate
                series.repeatDays = repeatDays
                series.parts = parts
                series.linkedPersonID = linkedPersonID
                series.linkedGoalID = linkedGoalID
                series.origin = origin
                series.isFlexible = isFlexible
                // startDate and endDate deliberately NOT touched here —
                // the series keeps its real anchor.
                store.updateEvent(series)

                if timesChanged {
                    switch timeScope {
                    case .future:
                        store.changeTimesFromOccurrence(
                            eventID: original.id,
                            date: occurrenceDay,
                            startMinutes: newStartMinutes,
                            durationMinutes: newMinutes
                        )
                    case .thisDay, .none:
                        // Per-day overrides — the same mechanism dragging
                        // an occurrence already uses.
                        if newStartMinutes != originalStartMinutes {
                            store.setOccurrenceTime(eventID: original.id, date: occurrenceDay, startMinutes: newStartMinutes)
                        }
                        if newMinutes != originalMinutes {
                            store.setOccurrenceDuration(eventID: original.id, date: occurrenceDay, minutes: newMinutes)
                        }
                    }
                }
            } else {
                // A one-off event has only one occurrence, so its own
                // startDate/endDate ARE the real thing — no shifting,
                // no anchor to protect, safe to edit directly.
                //
                // This is always a plain edit — start and end are
                // treated the same, with no inference about WHY the
                // end changed. An earlier version tried guessing that
                // "end changed after start time" meant "this ran long,
                // log it" — but that meant an ordinary correction
                // (fixing a typo, moving something for an unrelated
                // reason) could get silently recorded as calibration
                // data. Logging an actual is now its own explicit
                // button below, never inferred from just editing a field.
                //
                // Starts from the live event rather than the snapshot the
                // editor opened with, so a time logged moments ago with
                // that button isn't wiped out by saving.
                if let live = store.events.first(where: { $0.id == original.id }) {
                    updated = live
                }
                updated.title = resolvedTitle
                updated.categoryID = categoryID
                updated.startDate = resolvedStart
                updated.endDate = resolvedEnd
                updated.isAllDay = isAllDay
                updated.flowsToDaily = isAllDay ? false : flowsToDaily
                updated.recurrence = recurrence
                updated.recurrenceEndDate = recurrenceEndDate
                updated.repeatDays = repeatDays
                updated.parts = parts
                updated.linkedPersonID = linkedPersonID
                updated.linkedGoalID = linkedGoalID
                updated.origin = origin
            updated.isFlexible = isFlexible
                store.updateEvent(updated)
            }
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
            event.parts = parts
            event.linkedPersonID = linkedPersonID
            event.linkedGoalID = linkedGoalID
            event.origin = origin
            event.isFlexible = isFlexible
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

// MARK: - Detail screens

/// Everything about how an event repeats, pushed from the collapsed
/// "Repeats" row. Its own screen rather than inline, so the main editor
/// stays short — this is configured once and rarely revisited.
private struct RepeatsDetailView: View {
    @Binding var recurrence: EventRecurrence
    @Binding var repeatDays: Set<Int>
    @Binding var recurrenceEndDate: Date?
    let fallbackEndDate: Date

    var body: some View {
        Form {
            Section {
                Picker("Repeats", selection: $recurrence) {
                    ForEach(EventRecurrence.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            if recurrence == .daily {
                Section("On these days") {
                    RepeatDaysPicker(repeatDays: $repeatDays)
                }
            }

            if recurrence != .none {
                Section {
                    Toggle("Stops repeating", isOn: Binding(
                        get: { recurrenceEndDate != nil },
                        set: { on in
                            recurrenceEndDate = on
                                ? Calendar.current.date(byAdding: .month, value: 3, to: fallbackEndDate)
                                : nil
                        }
                    ))
                    if recurrenceEndDate != nil {
                        DatePicker(
                            "Until",
                            selection: Binding(
                                get: { recurrenceEndDate ?? fallbackEndDate },
                                set: { recurrenceEndDate = $0 }
                            ),
                            displayedComponents: .date
                        )
                    }
                } footer: {
                    Text("Changing the time of a repeating event asks whether it's for this day only or this and all future days. Earlier days keep the times they had.")
                }
            }
        }
        .navigationTitle("Repeats")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Breaking a block into named pieces, pushed from the collapsed
/// "Break into parts" row.
private struct PartsDetailView: View {
    @Binding var parts: [EventPart]
    @Binding var end: Date
    let start: Date

    private var partsTotalMinutes: Int {
        parts.reduce(0) { $0 + $1.estimatedMinutes }
    }

    private var blockDurationMinutes: Int {
        max(Int(end.timeIntervalSince(start) / 60), 0)
    }

    private func minuteText(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    var body: some View {
        Form {
            Section {
                ForEach($parts) { $part in
                    HStack {
                        TextField("e.g. Read textbook", text: $part.title)
                        Spacer()
                        TextField("min", value: $part.estimatedMinutes, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 44)
                        Text("min")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .onDelete { offsets in
                    parts.remove(atOffsets: offsets)
                }

                Button {
                    parts.append(EventPart(title: "", estimatedMinutes: 30))
                } label: {
                    Label("Add a part", systemImage: "plus")
                }
            } footer: {
                Text("Splitting a task into named pieces tends to produce a more accurate estimate than guessing at the whole thing.")
            }

            if !parts.isEmpty {
                Section {
                    HStack {
                        Text("Parts total")
                        Spacer()
                        Text(minuteText(partsTotalMinutes))
                            .foregroundStyle(partsTotalMinutes > blockDurationMinutes ? .orange : .secondary)
                    }
                    if partsTotalMinutes > blockDurationMinutes {
                        Button("Extend block to \(minuteText(partsTotalMinutes))") {
                            end = start.addingTimeInterval(TimeInterval(partsTotalMinutes * 60))
                        }
                    }
                } footer: {
                    if partsTotalMinutes > blockDurationMinutes {
                        // Not an error — this is the expected result of
                        // breaking a task down, and the reason the
                        // feature is worth having at all.
                        Text("The parts add up to more than you set aside. That's normal once a task is unpacked — extend the block, or trim the scope.")
                    }
                }
            }
        }
        .navigationTitle("Parts")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Goal and person links, pushed from the collapsed "Links" row.
private struct LinksDetailView: View {
    @ObservedObject var peopleStore: PeopleStore
    @ObservedObject var goalsStore: GoalsStore
    @Binding var linkedGoalID: UUID?
    @Binding var linkedPersonID: UUID?

    @State private var showingGoalPicker = false
    @State private var showingPersonPicker = false

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

    var body: some View {
        Form {
            Section {
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
        }
        .navigationTitle("Links")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingPersonPicker) {
            PersonPickerSheet(peopleStore: peopleStore, selection: $linkedPersonID)
        }
        .sheet(isPresented: $showingGoalPicker) {
            EventGoalPickerSheet(goalsStore: goalsStore, selection: $linkedGoalID)
        }
    }
}


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

