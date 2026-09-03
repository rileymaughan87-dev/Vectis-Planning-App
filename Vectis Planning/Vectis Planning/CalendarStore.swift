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
            dailyCalendarStartHour = savedHours.startHour
            dailyCalendarEndHour = savedHours.endHour
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
    }

    // MARK: - Reading

    func events(on date: Date) -> [CalendarEvent] {
        let calendar = Calendar.current
        return events.filter { calendar.isDate($0.startDate, inSameDayAs: date) }
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

    func deleteEvent(_ id: UUID) {
        events.removeAll { $0.id == id }
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

