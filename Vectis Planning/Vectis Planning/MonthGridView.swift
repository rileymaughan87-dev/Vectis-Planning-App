import SwiftUI

/// A reusable month grid — header with prev/next month, weekday labels,
/// and day cells showing a colored dot + name for each item (capped at
/// 3, with "+N more" beyond that). Used by both the Long-Term and Master
/// calendars, which look identical but differ in *what* feeds each day.
struct MonthGridView: View {
    @Binding var displayedMonth: Date
    let items: (Date) -> [LongTermDayItem]
    let onSelectDay: (Date) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            monthHeader
            weekdayRow
            monthGrid
        }
    }

    private var monthHeader: some View {
        HStack {
            Button {
                changeMonth(by: -1)
            } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(displayedMonth.formatted(.dateTime.month(.wide).year()))
                .font(.title3.weight(.bold))
            Spacer()
            Button {
                changeMonth(by: 1)
            } label: {
                Image(systemName: "chevron.right")
            }
        }
    }

    private func changeMonth(by delta: Int) {
        if let newMonth = Calendar.current.date(byAdding: .month, value: delta, to: displayedMonth) {
            displayedMonth = newMonth
        }
    }

    private var weekdayRow: some View {
        HStack {
            ForEach(Array(Calendar.current.veryShortWeekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                Text(symbol)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// One entry per day in the displayed month, `nil` for the leading
    /// blank cells before the 1st falls on the right weekday column.
    private var gridDays: [Date?] {
        let calendar = Calendar.current
        guard let range = calendar.range(of: .day, in: .month, for: displayedMonth),
              let monthStart = calendar.dateInterval(of: .month, for: displayedMonth)?.start else {
            return []
        }
        let firstWeekday = calendar.component(.weekday, from: monthStart)
        var days: [Date?] = Array(repeating: nil, count: firstWeekday - 1)
        for dayNumber in range {
            if let date = calendar.date(byAdding: .day, value: dayNumber - 1, to: monthStart) {
                days.append(date)
            }
        }
        return days
    }

    private var monthGrid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(gridDays.enumerated()), id: \.offset) { _, day in
                if let day {
                    dayCell(day)
                } else {
                    Color.clear.frame(height: 92)
                }
            }
        }
    }

    private func dayCell(_ day: Date) -> some View {
        let dayItems = items(day)
        let visible = Array(dayItems.prefix(3))
        let overflow = dayItems.count - visible.count
        let isToday = Calendar.current.isDateInToday(day)

        return Button {
            onSelectDay(day)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Calendar.current.component(.day, from: day))")
                    .font(.caption.weight(isToday ? .bold : .medium))
                    .foregroundStyle(isToday ? Color.accentColor : Color.primary)

                ForEach(visible) { item in
                    HStack(spacing: 3) {
                        Circle().fill(Color(hex: item.colorHex)).frame(width: 5, height: 5)
                        Text(item.title)
                            .font(.system(size: 9))
                            .lineLimit(1)
                    }
                }
                if overflow > 0 {
                    Text("+\(overflow) more")
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(4)
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(Color(isToday ? .tertiarySystemGroupedBackground : .secondarySystemGroupedBackground))
            )
        }
        .buttonStyle(.plain)
    }
}

