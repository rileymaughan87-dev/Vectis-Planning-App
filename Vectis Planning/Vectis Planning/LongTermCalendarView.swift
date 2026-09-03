import SwiftUI

/// The Long-Term calendar: a goals summary up top, then a month grid
/// (Apple Calendar-style) below it. Tapping a day opens a quick summary
/// and lets you add something that stays on this calendar specifically
/// — it won't show up on the Daily calendar's 30-minute grid.
struct LongTermCalendarView: View {
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var displayedMonth = Calendar.current.dateInterval(of: .month, for: Date())?.start ?? Date()
    @State private var selectedDay: IdentifiableDate?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    goalsSection
                    MonthGridView(
                        displayedMonth: $displayedMonth,
                        items: { day in
                            longTermDayItems(
                                on: day,
                                calendarStore: calendarStore,
                                goalsStore: goalsStore,
                                milestoneColorHex: appearanceStore.secondaryHex
                            )
                        },
                        onSelectDay: { day in selectedDay = IdentifiableDate(date: day) }
                    )
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .sheet(item: $selectedDay) { wrapped in
                DayDetailSheet(
                    date: wrapped.date,
                    calendarStore: calendarStore,
                    goalsStore: goalsStore,
                    milestoneColorHex: appearanceStore.secondaryHex
                )
            }
        }
    }

    // MARK: - Goals summary

    @ViewBuilder
    private var goalsSection: some View {
        let goals = goalsStore.longTermGoals
        if !goals.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Goals")
                    .font(.title3.weight(.bold))
                ForEach(goals) { goal in
                    goalSummaryCard(goal)
                }
            }
        }
    }

    private func goalSummaryCard(_ goal: Goal) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(goal.title)
                    .font(.subheadline.weight(.medium))
                Spacer()
                if goal.isTargetOverdue {
                    Text("Overdue")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                } else if !goal.milestones.isEmpty {
                    Text("\(goal.milestones.completionPercentage)%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if !goal.milestones.isEmpty {
                ProgressView(value: Double(goal.milestones.completionPercentage), total: 100)
                    .tint(appearanceStore.secondaryColor)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
    }
}

/// Shown when you tap a day: everything scheduled that day, plus a way
/// to add something new that stays on this calendar specifically.
struct DayDetailSheet: View {
    let date: Date
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    var milestoneColorHex: String = "#1C8C82"

    @Environment(\.dismiss) private var dismiss
    @State private var showingAddEvent = false
    @State private var editingEvent: CalendarEvent?

    private var eventItems: [LongTermDayItem] {
        longTermDayItems(on: date, calendarStore: calendarStore, goalsStore: goalsStore, milestoneColorHex: milestoneColorHex).filter { !$0.isMilestone }
    }
    private var milestoneItems: [LongTermDayItem] {
        longTermDayItems(on: date, calendarStore: calendarStore, goalsStore: goalsStore, milestoneColorHex: milestoneColorHex).filter { $0.isMilestone }
    }

    /// Pairs each event item with its full CalendarEvent (for the actual
    /// start/end times) and sorts by start time, so the list reads top
    /// to bottom the same way your day actually unfolds.
    private var sortedEventPairs: [(item: LongTermDayItem, event: CalendarEvent)] {
        eventItems
            .compactMap { item in
                guard let event = calendarStore.events.first(where: { $0.id == item.id }) else { return nil }
                return (item, event)
            }
            .sorted { $0.event.startDate < $1.event.startDate }
    }

    var body: some View {
        NavigationStack {
            List {
                if eventItems.isEmpty && milestoneItems.isEmpty {
                    Text("Nothing scheduled.")
                        .foregroundStyle(.secondary)
                }

                if !eventItems.isEmpty {
                    Section {
                        ForEach(sortedEventPairs, id: \.item.id) { pair in
                            Button {
                                editingEvent = pair.event
                            } label: {
                                HStack {
                                    Circle().fill(Color(hex: pair.item.colorHex)).frame(width: 8, height: 8)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(pair.item.title)
                                            .foregroundStyle(.primary)
                                        Text("\(pair.event.startDate.formatted(date: .omitted, time: .shortened)) – \(pair.event.endDate.formatted(date: .omitted, time: .shortened))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                calendarStore.deleteEvent(sortedEventPairs[index].event.id)
                            }
                        }
                    }
                }

                if !milestoneItems.isEmpty {
                    Section {
                        ForEach(milestoneItems) { item in
                            HStack {
                                Circle().fill(Color(hex: item.colorHex)).frame(width: 8, height: 8)
                                Text(item.title)
                                Spacer()
                                Text("Edit in Goals")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } header: {
                        Text("Goal milestones")
                    } footer: {
                        Text("Milestones are edited from the goal itself on the Goals page, not here.")
                    }
                }
            }
            .navigationTitle(date.formatted(.dateTime.weekday(.wide).month(.wide).day()))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        showingAddEvent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddEvent) {
                EventEditorSheet(
                    store: calendarStore,
                    date: date,
                    startMinutes: 9 * 60,
                    endMinutes: 9 * 60 + 30,
                    flowsToDaily: false
                )
            }
            .sheet(item: $editingEvent) { event in
                EventEditorSheet(store: calendarStore, editing: event)
            }
        }
    }
}

