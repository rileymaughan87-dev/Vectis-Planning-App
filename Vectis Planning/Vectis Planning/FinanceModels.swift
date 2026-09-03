import Foundation

enum FinanceEntryType: String, Codable, CaseIterable {
    case income
    case expense
}

/// Only meaningful for expenses — income doesn't have this distinction.
enum FinanceExpenseCategory: String, Codable, CaseIterable {
    case fixed
    case flexible
}

enum FinanceFrequency: String, Codable {
    case none
    case monthly
    case weekly
}

/// A single financial calendar entry — rent, a paycheque, a one-off
/// planned expense like a wedding gift, anything. Recurring entries
/// (repeats = true) don't get a separate stored row per occurrence;
/// instead, `occurrences(in:)` below calculates on the fly which dates
/// an event actually falls on in a given month, the same way we handle
/// a short-term goal's recurring days.
struct FinanceEvent: Identifiable, Codable {
    var id: UUID = UUID()
    var title: String
    var entryType: FinanceEntryType
    var expenseCategory: FinanceExpenseCategory? = nil
    var amount: Double = 0
    var date: Date
    var repeats: Bool = false
    var frequency: FinanceFrequency = .none
    var weekday: Int? = nil   // 1 = Sunday ... 7 = Saturday, only for .weekly

    // If true, `amount` is treated as an estimate rather than a fact —
    // built for things like irregular paycheques with overtime.
    var amountVaries: Bool = false

    // Maps one occurrence's day to the CONFIRMED real amount, once
    // you've tapped in and corrected it from the estimate. A day with
    // no entry here is still just running on the estimate, and the
    // calendar keeps it visually flagged until you fix it.
    //
    // String keys rather than Date keys, for the same JSON encoding
    // reason as Goal.completions — see the note there.
    var confirmedAmounts: [String: Double] = [:]
}

extension FinanceEvent {
    /// Every date this event actually falls on within the month
    /// containing `month`. A one-off event either falls in that month
    /// or it doesn't; a recurring one gets calculated fresh each time
    /// rather than needing a stored row per occurrence.
    func occurrences(in month: Date) -> [Date] {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: month) else { return [] }
        let anchorDay = calendar.startOfDay(for: date)

        if !repeats {
            return interval.contains(date) ? [anchorDay] : []
        }

        switch frequency {
        case .none:
            return []

        case .monthly:
            // Don't generate occurrences in months before this event existed.
            guard let anchorMonthStart = calendar.dateInterval(of: .month, for: date)?.start,
                  interval.start >= anchorMonthStart else {
                return []
            }
            let targetDay = calendar.component(.day, from: date)
            var comps = calendar.dateComponents([.year, .month], from: interval.start)
            let daysInMonth = calendar.range(of: .day, in: .month, for: interval.start)?.count ?? 28
            // Clamp to the last real day of shorter months (e.g. a 31st
            // anchor in February just lands on the 28th/29th instead).
            comps.day = min(targetDay, daysInMonth)
            guard let occurrence = calendar.date(from: comps) else { return [] }
            return [calendar.startOfDay(for: occurrence)]

        case .weekly:
            guard let weekday else { return [] }
            var results: [Date] = []
            var cursor = interval.start
            while cursor < interval.end {
                if calendar.component(.weekday, from: cursor) == weekday && cursor >= anchorDay {
                    results.append(calendar.startOfDay(for: cursor))
                }
                guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
                cursor = next
            }
            return results
        }
    }

    /// The confirmed amount for a specific occurrence if one's been
    /// entered, otherwise the estimate.
    func amount(on occurrenceDate: Date) -> Double {
        guard amountVaries else { return amount }
        return confirmedAmounts[Goal.dayKey(occurrenceDate)] ?? amount
    }

    /// False only for a varying event whose occurrence hasn't had its
    /// real amount entered yet — this is what drives the "flagged" state.
    func isConfirmed(on occurrenceDate: Date) -> Bool {
        guard amountVaries else { return true }
        return confirmedAmounts[Goal.dayKey(occurrenceDate)] != nil
    }
}

