import SwiftUI

/// Shown after press-and-hold + drag on the grid. Prefilled with the
/// time range you just dragged out, but everything is still editable
/// before you actually commit it.
struct EventEditorSheet: View {
    @ObservedObject var store: CalendarStore
    let originalEvent: CalendarEvent?

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var categoryID: UUID?
    @State private var start: Date
    @State private var end: Date
    @State private var flowsToDaily: Bool

    /// For creating a brand-new event at a given date/time range.
    init(store: CalendarStore, date: Date, startMinutes: Int, endMinutes: Int, flowsToDaily: Bool = true) {
        self.store = store
        self.originalEvent = nil
        let dayStart = Calendar.current.startOfDay(for: date)
        _title = State(initialValue: "")
        _categoryID = State(initialValue: store.categories.first?.id)
        _start = State(initialValue: dayStart.addingTimeInterval(TimeInterval(startMinutes * 60)))
        _end = State(initialValue: dayStart.addingTimeInterval(TimeInterval(endMinutes * 60)))
        _flowsToDaily = State(initialValue: flowsToDaily)
    }

    /// For editing an event that already exists.
    init(store: CalendarStore, editing event: CalendarEvent) {
        self.store = store
        self.originalEvent = event
        _title = State(initialValue: event.title)
        _categoryID = State(initialValue: event.categoryID)
        _start = State(initialValue: event.startDate)
        _end = State(initialValue: event.endDate)
        _flowsToDaily = State(initialValue: event.flowsToDaily)
    }

    private var isEditing: Bool { originalEvent != nil }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                Picker("Category", selection: $categoryID) {
                    ForEach(store.categories) { category in
                        Text(category.name).tag(Optional(category.id))
                    }
                }
                DatePicker("Start", selection: $start, displayedComponents: [.date, .hourAndMinute])
                DatePicker("End", selection: $end, displayedComponents: [.date, .hourAndMinute])

                Toggle("Show on Daily calendar", isOn: $flowsToDaily)

                if let original = originalEvent {
                    Button("Delete event", role: .destructive) {
                        store.deleteEvent(original.id)
                        dismiss()
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit event" : "New event")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Add") {
                        guard let categoryID else { return }
                        let resolvedTitle = title.trimmingCharacters(in: .whitespaces).isEmpty ? "New event" : title

                        if var updated = originalEvent {
                            updated.title = resolvedTitle
                            updated.categoryID = categoryID
                            updated.startDate = start
                            updated.endDate = end
                            updated.flowsToDaily = flowsToDaily
                            store.updateEvent(updated)
                        } else {
                            let event = CalendarEvent(
                                title: resolvedTitle,
                                startDate: start,
                                endDate: end,
                                categoryID: categoryID,
                                flowsToDaily: flowsToDaily
                            )
                            store.addEvent(event)
                        }
                        dismiss()
                    }
                }
            }
        }
    }
}

