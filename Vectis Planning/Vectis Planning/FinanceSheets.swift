import SwiftUI

/// Handles both creating and editing a financial event — same form
/// either way, matching the mockup: type, category (expenses only),
/// date, optional recurrence with a day-of-week picker for weekly, and
/// the "amount varies" toggle for irregular paycheques.
struct FinanceEventEditorSheet: View {
    @ObservedObject var store: FinanceStore
    let originalEvent: FinanceEvent?

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var entryType: FinanceEntryType
    @State private var expenseCategory: FinanceExpenseCategory
    @State private var eventDate: Date
    @State private var repeats: Bool
    @State private var frequency: FinanceFrequency
    @State private var weekday: Int
    @State private var amountVaries: Bool
    @State private var amountText: String

    private let weekdaySymbols = Calendar.current.shortWeekdaySymbols

    /// For creating a brand-new event, anchored to whichever month is
    /// currently displayed.
    init(store: FinanceStore, date: Date) {
        self.store = store
        self.originalEvent = nil
        _title = State(initialValue: "")
        _entryType = State(initialValue: .expense)
        _expenseCategory = State(initialValue: .fixed)
        _eventDate = State(initialValue: date)
        _repeats = State(initialValue: false)
        _frequency = State(initialValue: .monthly)
        _weekday = State(initialValue: Calendar.current.component(.weekday, from: date))
        _amountVaries = State(initialValue: false)
        _amountText = State(initialValue: "")
    }

    /// For editing an event that already exists.
    init(store: FinanceStore, editing event: FinanceEvent) {
        self.store = store
        self.originalEvent = event
        _title = State(initialValue: event.title)
        _entryType = State(initialValue: event.entryType)
        _expenseCategory = State(initialValue: event.expenseCategory ?? .fixed)
        _eventDate = State(initialValue: event.date)
        _repeats = State(initialValue: event.repeats)
        _frequency = State(initialValue: event.frequency == .none ? .monthly : event.frequency)
        _weekday = State(initialValue: event.weekday ?? Calendar.current.component(.weekday, from: event.date))
        _amountVaries = State(initialValue: event.amountVaries)
        _amountText = State(initialValue: event.amount == 0 ? "" : String(format: "%.2f", event.amount))
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)

                Picker("Type", selection: $entryType) {
                    Text("Income").tag(FinanceEntryType.income)
                    Text("Expense").tag(FinanceEntryType.expense)
                }
                .pickerStyle(.segmented)

                if entryType == .expense {
                    Picker("Category", selection: $expenseCategory) {
                        Text("Fixed").tag(FinanceExpenseCategory.fixed)
                        Text("Flexible").tag(FinanceExpenseCategory.flexible)
                    }
                    .pickerStyle(.segmented)
                }

                DatePicker("Date", selection: $eventDate, displayedComponents: .date)

                Section {
                    Toggle("Repeats", isOn: $repeats)

                    if repeats {
                        Picker("Frequency", selection: $frequency) {
                            Text("Monthly").tag(FinanceFrequency.monthly)
                            Text("Weekly").tag(FinanceFrequency.weekly)
                        }
                        .pickerStyle(.segmented)

                        if frequency == .weekly {
                            Picker("Day", selection: $weekday) {
                                ForEach(1...7, id: \.self) { day in
                                    Text(weekdaySymbols[day - 1]).tag(day)
                                }
                            }
                        }

                        Toggle("Amount varies each time", isOn: $amountVaries)
                        if amountVaries {
                            Text("You'll confirm the real amount each time it happens — until then, the estimate below is used and flagged on the calendar.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    TextField(amountVaries ? "Typical / estimated amount" : "Amount", text: $amountText)
                        .keyboardType(.decimalPad)
                }

                if let original = originalEvent {
                    Button("Delete", role: .destructive) {
                        store.deleteEvent(original.id)
                        dismiss()
                    }
                }
            }
            .navigationTitle(originalEvent == nil ? "Add financial event" : "Edit financial event")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(originalEvent == nil ? "Add" : "Save") { save() }
                }
            }
        }
    }

    private func save() {
        var event = originalEvent ?? FinanceEvent(title: "", entryType: entryType, date: eventDate)
        event.title = title.trimmingCharacters(in: .whitespaces).isEmpty ? "Untitled" : title
        event.entryType = entryType
        event.expenseCategory = entryType == .expense ? expenseCategory : nil
        event.date = eventDate
        event.repeats = repeats
        event.frequency = repeats ? frequency : .none
        event.weekday = (repeats && frequency == .weekly) ? weekday : nil
        event.amountVaries = repeats ? amountVaries : false
        event.amount = Double(amountText) ?? 0

        if originalEvent != nil {
            store.updateEvent(event)
        } else {
            store.addEvent(event)
        }
        dismiss()
    }
}

/// Shown when you tap a day on the Finance calendar: everything
/// financial that day. Tapping an unconfirmed varying item prompts for
/// the real amount right there; tapping anything else opens the full
/// editor.
struct FinanceDayDetailSheet: View {
    let date: Date
    @ObservedObject var store: FinanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var confirmingItem: (event: FinanceEvent, date: Date)?
    @State private var confirmAmountText = ""
    @State private var editingEvent: FinanceEvent?

    private let incomeColor = "#1C8C82"
    private let expenseColor = "#D2574A"
    private let unconfirmedColor = "#D6862C"

    private var items: [(event: FinanceEvent, date: Date)] {
        store.lineItems(on: date)
    }

    var body: some View {
        NavigationStack {
            List {
                if items.isEmpty {
                    Text("Nothing financial this day.")
                        .foregroundStyle(.secondary)
                }
                ForEach(items, id: \.event.id) { pair in
                    Button {
                        if pair.event.amountVaries && !pair.event.isConfirmed(on: pair.date) {
                            confirmAmountText = String(format: "%.2f", pair.event.amount(on: pair.date))
                            confirmingItem = pair
                        } else {
                            editingEvent = pair.event
                        }
                    } label: {
                        row(pair)
                    }
                }
            }
            .navigationTitle(date.formatted(.dateTime.weekday(.wide).month(.wide).day()))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(item: $editingEvent) { event in
                FinanceEventEditorSheet(store: store, editing: event)
            }
            .alert(
                "Confirm amount",
                isPresented: Binding(get: { confirmingItem != nil }, set: { if !$0 { confirmingItem = nil } })
            ) {
                TextField("Amount", text: $confirmAmountText)
                    .keyboardType(.decimalPad)
                Button("Save") {
                    if let item = confirmingItem, let value = Double(confirmAmountText) {
                        store.confirmAmount(eventID: item.event.id, on: item.date, amount: value)
                    }
                    confirmingItem = nil
                }
                Button("Cancel", role: .cancel) { confirmingItem = nil }
            } message: {
                Text("What was the actual amount for \(confirmingItem?.event.title ?? "this")?")
            }
        }
    }

    private func row(_ pair: (event: FinanceEvent, date: Date)) -> some View {
        let amount = pair.event.amount(on: pair.date)
        let confirmed = pair.event.isConfirmed(on: pair.date)
        let isIncome = pair.event.entryType == .income

        return HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(pair.event.title).foregroundStyle(.primary)
                if !confirmed {
                    Text("Tap to confirm the actual amount")
                        .font(.caption2)
                        .foregroundStyle(Color(hex: unconfirmedColor))
                }
            }
            Spacer()
            Text((isIncome ? "+" : "-") + amount.formatted(.currency(code: "USD")))
                .foregroundStyle(isIncome ? Color(hex: incomeColor) : Color(hex: expenseColor))
        }
    }
}
