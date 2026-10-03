import Foundation
import Combine

/// Holds calendar events and the categories they're tagged with. Same
/// pattern as GoalsStore: one shared source of truth, in memory for now.
class CalendarStore: ObservableObject {
    @Published var events: [CalendarEvent] = []
    @Published var categories: [CalendarCategory] = CalendarCategory.defaultCategories

    // Which hours show on the Daily calendar's grid. Editable from
    // Settings — this used to be a hardcoded constant living directly
    // in DailyCalendarView, which meant there was no way to actually
    // change it without editing code.
    @Published var dailyCalendarStartHour: Int = 6
    @Published var dailyCalendarEndHour: Int = 24

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let savedCategories = PersistenceManager.load([CalendarCategory].self, from: PersistenceManager.Filename.categories) {
            categories = savedCategories
        }
        if let savedEvents = PersistenceManager.load([CalendarEvent].self, from: PersistenceManager.Filename.calendarEvents) {
            events = savedEvents
        } else {
            events = CalendarStore.sampleEvents(categories: categories)
        }
        if let savedHours = PersistenceManager.load(CalendarHours.self, from: PersistenceManager.Filename.calendarHours) {
            // Clamped, because an end at or before the start gives the
            // Daily grid a negative number of rows and crashes it.
            // Settings no longer allows that, but older saves might.
            let start = min(max(savedHours.startHour, 0), 23)
            dailyCalendarStartHour = start
            dailyCalendarEndHour = min(max(savedHours.endHour, start + 1), 24)
        }

        $events
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.calendarEvents) }
            .store(in: &cancellables)

        $categories
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.categories) }
            .store(in: &cancellables)

        // Both hour values live in one file, so either changing writes
        // the current state of both.
        Publishers.CombineLatest($dailyCalendarStartHour, $dailyCalendarEndHour)
            .dropFirst()
            .sink { start, end in
                PersistenceManager.save(CalendarHours(startHour: start, endHour: end), to: PersistenceManager.Filename.calendarHours)
            }
            .store(in: &cancellables)

        repairOrphanedEvents()
    }

    /// Reassigns any event whose categoryID doesn't match a category
    /// that actually exists.
    ///
    /// This fixes data broken by an earlier bug where default categories
    /// were given fresh random IDs on each launch, orphaning every event
    /// that pointed at them — which showed up as all events losing their
    /// colour. The categories now have fixed IDs so it can't recur, but
    /// this cleans up anything already saved in the broken state.
    private func repairOrphanedEvents() {
        let validIDs = Set(categories.map { $0.id })
        guard let fallback = categories.first?.id else { return }

        var repaired = 0
        for index in events.indices where !validIDs.contains(events[index].categoryID) {
            events[index].categoryID = fallback
            repaired += 1
        }
        if repaired > 0 {
            print("Vectis: reassigned \(repaired) event(s) with missing categories")
        }
    }

    // MARK: - Reading

    /// Every event covering a given day — including multi-day spans and
    /// repeat occurrences, not just events that literally start that day.
    func events(on date: Date) -> [CalendarEvent] {
        events.filter { $0.occupies(date) }
    }

    /// The same, but with each event's times shifted onto that specific
    /// day. The Daily grid needs this so a weekly event draws at the
    /// right hours on every week it appears, not just its first.
    func timedEvents(on date: Date) -> [CalendarEvent] {
        events(on: date).map { event in
            var copy = event
            let times = event.times(on: date)
            copy.startDate = times.start
            copy.endDate = times.end
            return copy
        }
    }

    func category(for id: UUID?) -> CalendarCategory? {
        guard let id = id else { return nil }
        return categories.first { $0.id == id }
    }

    // MARK: - Writing

    func addEvent(_ event: CalendarEvent) {
        events.append(event)
    }

    /// Overwrites an existing event entirely — used when editing one
    /// through the editor sheet (title, category, or times changed).
    func updateEvent(_ updated: CalendarEvent) {
        guard let index = events.firstIndex(where: { $0.id == updated.id }) else { return }
        events[index] = updated
    }

    /// Moves an event to a new start time, keeping its original duration.
    /// This is what dragging an event on the grid calls once you let go.
    func moveEvent(_ id: UUID, newStart: Date) {
        guard let index = events.firstIndex(where: { $0.id == id }) else { return }
        let duration = events[index].endDate.timeIntervalSince(events[index].startDate)
        events[index].startDate = newStart
        events[index].endDate = newStart.addingTimeInterval(duration)
    }

    /// Changes an event's end time — the estimate-lock rule from the
    /// spec, applied here regardless of how the new end time was
    /// decided. Called from the event editor when only the end time
    /// changed (start left alone); an earlier version of this used a
    /// drag handle on the calendar directly, which kept getting
    /// confused with moving the whole event on a small touch calendar
    /// and was dropped in favour of the editor's own Start/End fields.
    ///
    /// The endDate always moves to match, since the block needs to
    /// visually show where it currently ends (including overlapping the
    /// next block, which is deliberate — the overlap itself is the
    /// signal, no dialog needed to explain it). Whether this ALSO
    /// counts as a logged actual depends on timing:
    ///
    /// - Before the event's start time: pure re-planning. The estimate
    ///   moves with it; nothing gets logged.
    /// - At or after the start time: this is what actually happened.
    ///   The original estimate gets frozen (once, the first time this
    ///   happens) and the new duration becomes the actual.
    func resizeEvent(_ id: UUID, newEnd: Date) {
        guard let index = events.firstIndex(where: { $0.id == id }) else { return }
        let event = events[index]
        let isLoggingAnActual = Date() >= event.startDate

        if isLoggingAnActual {
            if event.estimatedMinutes == nil {
                let originalMinutes = Int(event.endDate.timeIntervalSince(event.startDate) / 60)
                events[index].estimatedMinutes = originalMinutes
            }
            let actualMinutes = max(Int(newEnd.timeIntervalSince(event.startDate) / 60), 1)
            events[index].actualMinutes = actualMinutes

            // A segmented event's parts share in the actual too,
            // proportionally to their original estimates — this is
            // what lets "read textbook" and "write paper" each end up
            // with their own actual from one resize of the whole block,
            // rather than needing a separate drag per part.
            if !event.parts.isEmpty {
                let estimatedTotal = max(event.parts.reduce(0) { $0 + $1.estimatedMinutes }, 1)
                for partIndex in events[index].parts.indices {
                    let share = Double(events[index].parts[partIndex].estimatedMinutes) / Double(estimatedTotal)
                    events[index].parts[partIndex].actualMinutes = max(Int((Double(actualMinutes) * share).rounded()), 0)
                }
            }
        }

        events[index].endDate = newEnd
    }

    /// Moves ONE occurrence of a repeating event, leaving the series
    /// alone. The counterpart to `deleteOccurrence`.
    func setOccurrenceTime(eventID: UUID, date: Date, startMinutes: Int) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        let clamped = min(max(startMinutes, 0), 23 * 60 + 55)
        events[index].timeOverrides[Goal.dayKey(date)] = clamped
    }

    /// Changes the length of ONE occurrence of a repeating event,
    /// leaving the series alone. The counterpart to `setOccurrenceTime`.
    func setOccurrenceDuration(eventID: UUID, date: Date, minutes: Int) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        events[index].durationOverrides[Goal.dayKey(date)] = max(minutes, 5)
    }

    /// Logs how long ONE occurrence of a repeating event actually took.
    /// Same estimate-lock rule as `resizeEvent`: the planned length is
    /// frozen the first time, and the block then shows the real length
    /// for that day only.
    func logOccurrenceActual(eventID: UUID, date: Date, minutes: Int) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        let key = Goal.dayKey(date)
        let times = events[index].times(on: date)
        if events[index].occurrenceEstimates[key] == nil {
            events[index].occurrenceEstimates[key] = Int(times.end.timeIntervalSince(times.start) / 60)
        }
        let actual = max(minutes, 1)
        events[index].occurrenceActuals[key] = actual
        events[index].durationOverrides[key] = actual
    }

    /// Gives a repeating event new times from one occurrence onward.
    ///
    /// Earlier occurrences keep the times they actually had: the series
    /// is ended the day before, and a new series with the new times
    /// starts on this day. Overrides and deleted days are split between
    /// the two by date. From the series' very first day there's nothing
    /// earlier to protect, so the series itself just changes.
    func changeTimesFromOccurrence(eventID: UUID, date: Date, startMinutes: Int, durationMinutes: Int) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        let calendar = Calendar.current
        let splitDay = calendar.startOfDay(for: date)
        let splitKey = Goal.dayKey(splitDay)
        let newStart = splitDay.addingTimeInterval(TimeInterval(startMinutes * 60))
        let newEnd = newStart.addingTimeInterval(TimeInterval(max(durationMinutes, 5) * 60))

        var updated = events
        let original = updated[index]

        if splitDay <= calendar.startOfDay(for: original.startDate) {
            updated[index].startDate = newStart
            updated[index].endDate = newEnd
            updated[index].timeOverrides[splitKey] = nil
            updated[index].durationOverrides[splitKey] = nil
            events = updated
            return
        }

        var future = original
        future.id = UUID()
        future.startDate = newStart
        future.endDate = newEnd
        future.excludedOccurrences = original.excludedOccurrences.filter { $0 >= splitKey }
        // The new times ARE this day's times now, so its own overrides go.
        future.timeOverrides = original.timeOverrides.filter { $0.key > splitKey }
        future.durationOverrides = original.durationOverrides.filter { $0.key > splitKey }
        future.occurrenceActuals = original.occurrenceActuals.filter { $0.key >= splitKey }
        future.occurrenceEstimates = original.occurrenceEstimates.filter { $0.key >= splitKey }
        future.estimatedMinutes = nil
        future.actualMinutes = nil
        future.isCompleted = false

        updated[index].recurrenceEndDate = calendar.date(byAdding: .day, value: -1, to: splitDay)
        updated[index].excludedOccurrences = original.excludedOccurrences.filter { $0 < splitKey }
        updated[index].timeOverrides = original.timeOverrides.filter { $0.key < splitKey }
        updated[index].durationOverrides = original.durationOverrides.filter { $0.key < splitKey }
        updated[index].occurrenceActuals = original.occurrenceActuals.filter { $0.key < splitKey }
        updated[index].occurrenceEstimates = original.occurrenceEstimates.filter { $0.key < splitKey }
        updated.insert(future, at: index + 1)
        events = updated
    }

    func deleteEvent(_ id: UUID) {
        events.removeAll { $0.id == id }
    }

    /// Skips one occurrence of a repeating event without touching the
    /// rest of the series — "not doing this today" rather than "never
    /// doing this again."
    func deleteOccurrence(eventID: UUID, date: Date) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        events[index].excludedOccurrences.insert(Goal.dayKey(date))
    }

    // MARK: - Sample data

    static func sampleEvents(categories: [CalendarCategory]) -> [CalendarEvent] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        func time(_ hour: Int, _ minute: Int = 0) -> Date {
            calendar.date(bySettingHour: hour, minute: minute, second: 0, of: today) ?? today
        }

        let work = categories.first(where: { $0.name == "Work" })?.id ?? categories[0].id
        let personal = categories.first(where: { $0.name == "Personal" })?.id ?? categories[0].id
        let school = categories.first(where: { $0.name == "School" })?.id ?? categories[0].id

        return [
            CalendarEvent(title: "Team standup", startDate: time(9), endDate: time(9, 30), categoryID: work, flowsToDaily: true),
            CalendarEvent(title: "Lecture: Systems", startDate: time(10), endDate: time(11, 30), categoryID: school, flowsToDaily: true),
            CalendarEvent(title: "Study group", startDate: time(10, 30), endDate: time(11, 45), categoryID: school, flowsToDaily: true),
            CalendarEvent(title: "Lunch", startDate: time(12), endDate: time(13), categoryID: personal, flowsToDaily: true)
        ]
    }
}

