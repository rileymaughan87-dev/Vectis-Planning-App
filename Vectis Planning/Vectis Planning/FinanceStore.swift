import Foundation
import Combine

class FinanceStore: ObservableObject {
    @Published var events: [FinanceEvent] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let saved = PersistenceManager.load([FinanceEvent].self, from: PersistenceManager.Filename.financeEvents) {
            events = saved
        } else {
            events = FinanceStore.sampleEvents()
        }

        $events
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.financeEvents) }
            .store(in: &cancellables)
    }

    // MARK: - Writing

    func addEvent(_ event: FinanceEvent) {
        events.append(event)
    }

    func updateEvent(_ updated: FinanceEvent) {
        guard let index = events.firstIndex(where: { $0.id == updated.id }) else { return }
        events[index] = updated
    }

    func deleteEvent(_ id: UUID) {
        events.removeAll { $0.id == id }
    }

    /// Records the real amount for one occurrence of a varying event —
    /// this is what clears the "unconfirmed" flag on the calendar for
    /// that specific date, without touching any other occurrence.
    func confirmAmount(eventID: UUID, on date: Date, amount: Double) {
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        events[index].confirmedAmounts[Goal.dayKey(date)] = amount
    }

    // MARK: - Monthly totals

    func totalIncome(for month: Date) -> Double {
        events.filter { $0.entryType == .income }
            .flatMap { event in event.occurrences(in: month).map { event.amount(on: $0) } }
            .reduce(0, +)
    }

    func totalExpenses(for month: Date) -> Double {
        events.filter { $0.entryType == .expense }
            .flatMap { event in event.occurrences(in: month).map { event.amount(on: $0) } }
            .reduce(0, +)
    }

    func totalExpenses(for month: Date, category: FinanceExpenseCategory) -> Double {
        events.filter { $0.entryType == .expense && $0.expenseCategory == category }
            .flatMap { event in event.occurrences(in: month).map { event.amount(on: $0) } }
            .reduce(0, +)
    }

    /// Every (event, occurrence date) pair falling in a given month,
    /// sorted chronologically — what the budget list reads from.
    func lineItems(for month: Date) -> [(event: FinanceEvent, date: Date)] {
        events
            .flatMap { event in event.occurrences(in: month).map { (event, $0) } }
            .sorted { $0.1 < $1.1 }
    }

    /// Just the occurrences landing on one specific day — what the
    /// day-detail sheet reads from.
    func lineItems(on day: Date) -> [(event: FinanceEvent, date: Date)] {
        let calendar = Calendar.current
        return events
            .flatMap { event in event.occurrences(in: day).map { (event, $0) } }
            .filter { calendar.isDate($0.1, inSameDayAs: day) }
    }

    // MARK: - Sample data

    static func sampleEvents() -> [FinanceEvent] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let payWeekday = calendar.component(.weekday, from: today)

        let rent = FinanceEvent(
            title: "Rent", entryType: .expense, expenseCategory: .fixed,
            amount: 1200, date: today, repeats: true, frequency: .monthly
        )
        let paycheque = FinanceEvent(
            title: "Paycheque", entryType: .income,
            amount: 600, date: today, repeats: true, frequency: .weekly,
            weekday: payWeekday, amountVaries: true
        )
        let groceries = FinanceEvent(
            title: "Groceries", entryType: .expense, expenseCategory: .flexible,
            amount: 90, date: today, repeats: true, frequency: .weekly, weekday: payWeekday
        )

        return [rent, paycheque, groceries]
    }
}

