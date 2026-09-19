import SwiftUI

// MARK: - Shared editor pieces

/// A bordered box with an accent stripe beside its title — the same
/// shape `SectionBox` gives the Goals and Home screens, so the editors
/// stop looking like stock iOS Settings and start looking like the rest
/// of this app.
private struct EditorBox<Content: View>: View {
    let title: String
    let accent: Color
    var trailing: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(accent)
                    .frame(width: 4, height: 16)
                Text(title)
                    .font(.subheadline.weight(.medium))
                Spacer()
                if let trailing {
                    Text(trailing)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            content()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }
}

/// A collapsed row standing in for a whole section, showing a summary of
/// what's inside so nothing becomes invisible just because it's folded
/// away — you can see that something repeats, and how, without opening it.
private struct EditorSummaryRow: View {
    let title: String
    let summary: String

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                Text(summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }
}

/// Category as tappable colour chips rather than a text menu. The colour
/// is real information the old picker hid — worth surfacing, though it
/// would need rethinking past roughly five or six categories, since
/// chips wrap rather than scroll.
private struct CategoryChips: View {
    let categories: [CalendarCategory]
    @Binding var selection: UUID?

    var body: some View {
        FlowRow(spacing: 6) {
            ForEach(categories) { category in
                chip(for: category)
            }
        }
    }

    private func chip(for category: CalendarCategory) -> some View {
        let color = Color(hex: category.colorHex)
        let isSelected = selection == category.id
        return Button {
            selection = category.id
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(category.name)
                    .font(.caption)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(isSelected ? color.opacity(0.15) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .strokeBorder(isSelected ? color : Color(.separator), lineWidth: isSelected ? 1.5 : 0.5)
            )
            .foregroundStyle(isSelected ? .primary : .secondary)
        }
        .buttonStyle(.plain)
    }
}

/// Wraps its children onto new lines when they run out of width, which
/// a plain HStack won't do. Needed for the category chips, since how
/// many fit per row depends on the names.
private struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // Falls back to the screen width rather than infinity — an
        // unconstrained proposal should be rare here since this always
        // sits inside a screen-width ScrollView, but reporting infinity
        // if it ever happened would make the whole row refuse to wrap.
        let maxWidth = proposal.width ?? (UIScreen.main.bounds.width - 60)
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}


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
        _loggedMinutes = State(initialValue: event.actualMinutes ?? max(Int(event.endDate.timeIntervalSince(event.startDate) / 60), 5))
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
    /// Only offered for an existing, timed, non-repeating event whose
    /// start time has already passed — there's nothing to log for a new
    /// event, an all-day one, or something that hasn't happened yet.
    /// Repeating events are excluded because there's no per-occurrence
    /// duration override to log against yet (see the footer note above).
    private var canLogActual: Bool {
        guard let event = originalEvent, !isAllDay, event.recurrence == .none else { return false }
        return Date() >= event.startDate
    }


    private var accentColor: Color {
        guard let categoryID,
              let category = store.categories.first(where: { $0.id == categoryID })
        else { return .vectisTeal }
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
        VStack(alignment: .leading, spacing: 4) {
            Text("Title")
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField("New event", text: $title)
                .font(.title3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Rectangle().fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(alignment: .leading) {
            // The category's own colour, so the event's colour is
            // visible the moment the editor opens rather than buried
            // inside a picker.
            Rectangle().fill(accentColor).frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous))
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
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            // Time-only, not date-and-time — a compact picker showing
            // both ("9/18/26, 10:00 AM") is too wide for two of these
            // side by side. scaleEffect doesn't help here: it shrinks
            // how a view LOOKS, not the space SwiftUI reserves for it,
            // so the row still overflowed even though it visually
            // appeared smaller.
            DatePicker("", selection: selection, displayedComponents: .hourAndMinute)
                .labelsHidden()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .fill(Color(.tertiarySystemGroupedBackground))
        )
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
                            let newEnd = event.startDate.addingTimeInterval(TimeInterval(loggedMinutes * 60))
                            store.resizeEvent(event.id, newEnd: newEnd)
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
                        Text(originalEvent?.actualMinutes != nil ? "Update logged time" : "Log actual time")
                    }
                    .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))

                    if let actual = originalEvent?.actualMinutes {
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

                // A start-time change on THIS occurrence becomes a
                // per-day override — the same mechanism dragging an
                // occurrence already uses — rather than moving the
                // series. There's currently no per-day DURATION
                // override, so an end-only change on a repeating event
                // isn't logged as an actual yet; that needs its own
                // model work rather than reusing setOccurrenceTime,
                // which assumes the series' normal duration.
                if resolvedStart != original.startDate {
                    let calendar = Calendar.current
                    let occurrenceDay = calendar.startOfDay(for: original.startDate)
                    let comps = calendar.dateComponents([.hour, .minute], from: resolvedStart)
                    let startMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
                    store.setOccurrenceTime(eventID: original.id, date: occurrenceDay, startMinutes: startMinutes)
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
                    Text("Changing the start time of a repeating event moves only the occurrence you opened. Changing just the end time isn't tracked per-occurrence yet.")
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

