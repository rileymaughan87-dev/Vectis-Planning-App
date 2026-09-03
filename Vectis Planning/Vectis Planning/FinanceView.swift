import SwiftUI

/// The Finance tab: a month calendar for financial dates (reusing the
/// same MonthGridView component Long-Term uses — no need to rebuild
/// month math a third time), and a budget snapshot + full ledger below
/// it for whichever month is currently displayed.
struct FinanceView: View {
    @ObservedObject var store: FinanceStore

    @State private var displayedMonth = Calendar.current.dateInterval(of: .month, for: Date())?.start ?? Date()
    @State private var selectedDay: IdentifiableDate?
    @State private var showingAddEvent = false

    // These stay fixed regardless of the chosen color scheme, on purpose.
    // Money-in-green / money-out-red is a near-universal convention, and
    // "unconfirmed amber" is a warning state — same reasoning as the
    // overdue red elsewhere. Making these themeable would trade real
    // at-a-glance clarity for cosmetic consistency.
    private let incomeColor = "#1C8C82"
    private let expenseColor = "#D2574A"
    private let unconfirmedColor = "#D6862C"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    MonthGridView(
                        displayedMonth: $displayedMonth,
                        items: { day in financeDayItems(on: day) },
                        onSelectDay: { day in selectedDay = IdentifiableDate(date: day) }
                    )
                    budgetSection
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingAddEvent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddEvent) {
                FinanceEventEditorSheet(store: store, date: displayedMonth)
            }
            .sheet(item: $selectedDay) { wrapped in
                FinanceDayDetailSheet(date: wrapped.date, store: store)
            }
        }
    }

    /// Unconfirmed estimates get a distinct amber dot regardless of
    /// income/expense, so they stand out on the month grid at a glance
    /// — the same flag-until-fixed idea we used for challenge catch-up.
    private func financeDayItems(on day: Date) -> [LongTermDayItem] {
        store.lineItems(on: day).map { pair in
            let confirmed = pair.event.isConfirmed(on: pair.date)
            let color = confirmed ? (pair.event.entryType == .income ? incomeColor : expenseColor) : unconfirmedColor
            return LongTermDayItem(id: pair.event.id, title: pair.event.title, colorHex: color, isMilestone: false)
        }
    }

    // MARK: - Budget section

    private var budgetSection: some View {
        let income = store.totalIncome(for: displayedMonth)
        let expenses = store.totalExpenses(for: displayedMonth)
        let balance = income - expenses
        let fixed = store.totalExpenses(for: displayedMonth, category: .fixed)
        let flexible = store.totalExpenses(for: displayedMonth, category: .flexible)
        let maxVal = max(income, expenses, 1)

        return VStack(alignment: .leading, spacing: 14) {
            Text("Budget")
                .font(.title3.weight(.bold))

            VStack(spacing: 4) {
                Text("Balance this month")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(balance, format: .currency(code: "USD"))
                    .font(.title.weight(.bold))
                    .foregroundStyle(balance >= 0 ? Color(hex: incomeColor) : Color(hex: expenseColor))
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 10) {
                summaryCard(title: "Income", amount: income, colorHex: incomeColor)
                summaryCard(title: "Expenses", amount: expenses, colorHex: expenseColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                comparisonBar(fraction: income / maxVal, colorHex: incomeColor)
                comparisonBar(fraction: expenses / maxVal, colorHex: expenseColor)
            }

            HStack {
                Text("Fixed expenses").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(fixed, format: .currency(code: "USD")).font(.caption)
            }
            HStack {
                Text("Flexible expenses").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(flexible, format: .currency(code: "USD")).font(.caption)
            }

            Divider()

            ForEach(store.lineItems(for: displayedMonth), id: \.event.id) { pair in
                lineItemRow(pair)
            }
        }
    }

    private func summaryCard(title: String, amount: Double, colorHex: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(amount, format: .currency(code: "USD"))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color(hex: colorHex))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
    }

    private func comparisonBar(fraction: Double, colorHex: String) -> some View {
        GeometryReader { geo in
            RoundedRectangle(cornerRadius: 4)
                .fill(Color(hex: colorHex))
                .frame(width: geo.size.width * max(min(fraction, 1), 0), height: 8)
        }
        .frame(height: 8)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 4).fill(Color(.secondarySystemGroupedBackground)))
    }

    private func lineItemRow(_ pair: (event: FinanceEvent, date: Date)) -> some View {
        let amount = pair.event.amount(on: pair.date)
        let confirmed = pair.event.isConfirmed(on: pair.date)
        let isIncome = pair.event.entryType == .income

        return HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(pair.event.title).font(.subheadline)
                Text(pair.date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if !confirmed {
                Text("Estimated")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(hex: unconfirmedColor))
            }
            Text((isIncome ? "+" : "-") + amount.formatted(.currency(code: "USD")))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isIncome ? Color(hex: incomeColor) : Color(hex: expenseColor))
        }
        .padding(.vertical, 4)
    }
}

