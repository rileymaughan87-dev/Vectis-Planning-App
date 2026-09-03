import SwiftUI

/// The Daily calendar: a scrollable 30-minute time grid for one day.
/// Press and hold anywhere empty to start a new event, drag while
/// holding to set its length, and drag an existing event to move it.
struct DailyCalendarView: View {
    // Changed from `@StateObject` to `@ObservedObject`, same reasoning
    // as GoalsStore: this View is handed the store rather than owning
    // it, so the Long-Term calendar (which reads the same events) always
    // sees the same up-to-date data.
    @ObservedObject var store: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var dayOffset = 0

    // These read from CalendarStore now, which Settings can edit —
    // replacing what used to be hardcoded constants here.
    private var startHour: Int { store.dailyCalendarStartHour }
    private var endHour: Int { store.dailyCalendarEndHour }
    private let leftGutter: CGFloat = 46

    // How tall each 30-minute slot is, in points. This is now the zoom
    // level — the +/- buttons in the toolbar adjust it directly.
    @State private var slotHeight: CGFloat = 24
    private let minSlotHeight: CGFloat = 14
    private let maxSlotHeight: CGFloat = 56

    // A tap on an empty slot opens the New Event sheet, prefilled with a
    // default 30-minute block starting at that time — you then adjust
    // the exact times using the pickers already in that sheet.
    @State private var pendingRange: MinuteRange?

    // Tapping an existing event opens the same sheet in edit mode.
    @State private var editingEvent: CalendarEvent?

    // Gesture state for dragging an existing event to a new time. An
    // event only actually becomes draggable once it's been held for a
    // moment first (see armedEventID) — otherwise a quick scroll swipe
    // that happens to start on top of an event would get mistaken for
    // "move this event" instead of "scroll the page".
    @State private var draggingEventID: UUID?
    @State private var dragOffsetMinutes = 0
    @State private var armedEventID: UUID?

    private var currentDate: Date {
        Calendar.current.date(byAdding: .day, value: dayOffset, to: Calendar.current.startOfDay(for: Date())) ?? Date()
    }

    private var totalSlots: Int { (endHour - startHour) * 2 }
    private var gridHeight: CGFloat { CGFloat(totalSlots) * slotHeight }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                dayHeader
                todaysGoalsStrip
                categoryLegend
                ScrollView {
                    gridArea
                        .padding(.horizontal)
                        .padding(.bottom, 20)
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button {
                        slotHeight = max(minSlotHeight, slotHeight - 6)
                    } label: {
                        Image(systemName: "minus.magnifyingglass")
                    }
                    Button {
                        slotHeight = min(maxSlotHeight, slotHeight + 6)
                    } label: {
                        Image(systemName: "plus.magnifyingglass")
                    }
                }
            }
            .sheet(item: $pendingRange) { range in
                EventEditorSheet(store: store, date: currentDate, startMinutes: range.start, endMinutes: range.end)
            }
            .sheet(item: $editingEvent) { event in
                EventEditorSheet(store: store, editing: event)
            }
        }
    }

    // MARK: - Header

    private var dayHeader: some View {
        HStack {
            Button {
                dayOffset -= 1
            } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(dayOffset == 0 ? "Today" : currentDate.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                .font(.headline)
            Spacer()
            Button {
                dayOffset += 1
            } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding()
    }

    // MARK: - Goals strip

    @ViewBuilder
    private var todaysGoalsStrip: some View {
        let todaysGoals = goalsStore.standaloneShortTermGoals.filter { $0.isScheduled(on: currentDate) }
        if !todaysGoals.isEmpty {
            let dayKey = Goal.dayKey(currentDate)
            let doneCount = todaysGoals.filter { $0.completions[dayKey] == true }.count

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Today's goals")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text("\(doneCount) of \(todaysGoals.count) done")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(todaysGoals) { goal in
                            goalChip(goal, dayKey: dayKey)
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    private func goalChip(_ goal: Goal, dayKey: String) -> some View {
        let done = goal.completions[dayKey] == true
        return Button {
            goalsStore.setToday(goal.id, done: !done)
        } label: {
            HStack(spacing: 5) {
                CompletionMark(isOn: done, size: 14, color: appearanceStore.primaryColor)
                Text(goal.title)
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Category legend

    private var categoryLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(store.categories) { category in
                    HStack(spacing: 4) {
                        Circle().fill(Color(hex: category.colorHex)).frame(width: 8, height: 8)
                        Text(category.name).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.bottom, 6)
    }

    // MARK: - Grid

    private var gridArea: some View {
        GeometryReader { geo in
            let contentWidth = max(geo.size.width - leftGutter - 8, 40)
            ZStack(alignment: .topLeading) {
                hourLines
                eventsLayer(contentWidth: contentWidth)
                currentTimeLine(contentWidth: contentWidth)
            }
        }
        .frame(height: gridHeight)
        .contentShape(Rectangle())
        .simultaneousGesture(
            SpatialTapGesture()
                .onEnded { value in
                    let start = minutes(fromY: value.location.y)
                    pendingRange = MinuteRange(start: start, end: start + 30)
                }
        )
    }

    private var hourLines: some View {
        ZStack(alignment: .topLeading) {
            ForEach(0...totalSlots, id: \.self) { i in
                let minutes = startHour * 60 + i * 30
                Divider()
                    .offset(y: CGFloat(i) * slotHeight)
                if minutes % 60 == 0 {
                    Text(timeLabel(minutes))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .offset(y: CGFloat(i) * slotHeight - 7)
                }
            }
        }
    }

    private func eventsLayer(contentWidth: CGFloat) -> some View {
        let laidOut = layoutEvents(store.events(on: currentDate).filter { $0.flowsToDaily })
        return ZStack(alignment: .topLeading) {
            ForEach(laidOut) { item in
                eventBlock(item, contentWidth: contentWidth)
            }
        }
    }

    private func eventBlock(_ item: LaidOutEvent, contentWidth: CGFloat) -> some View {
        let colWidth = contentWidth / CGFloat(item.columnCount)
        let isDragging = draggingEventID == item.event.id

        var displayStart = item.event.startDate
        var displayEnd = item.event.endDate
        if isDragging {
            let delta = TimeInterval(dragOffsetMinutes * 60)
            displayStart = item.event.startDate.addingTimeInterval(delta)
            displayEnd = item.event.endDate.addingTimeInterval(delta)
        }

        let startMin = minutesFromMidnight(displayStart)
        let endMin = minutesFromMidnight(displayEnd)
        let top = yOffset(forMinutes: startMin)
        let height = max(yOffset(forMinutes: endMin) - top, 18)
        let color = Color(hex: store.category(for: item.event.categoryID)?.colorHex ?? "#999999")

        return VStack(alignment: .leading, spacing: 1) {
            Text(item.event.title)
                .font(.caption.weight(.medium))
                .lineLimit(2)
            if height > 32 {
                Text("\(timeLabel(startMin)) – \(timeLabel(endMin))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(6)
        .frame(width: max(colWidth - 4, 20), height: height, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: DesignTokens.smallRadius).fill(color.opacity(0.2)))
        .overlay(Rectangle().fill(color).frame(width: 3), alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.smallRadius))
        .offset(x: leftGutter + CGFloat(item.column) * colWidth, y: top)
        .onTapGesture {
            editingEvent = item.event
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.4, maximumDistance: 20)
                .onEnded { _ in
                    armedEventID = item.event.id
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 2)
                .onChanged { value in
                    // Only actually move the event once it's "armed" by
                    // the long press above — until then, this movement
                    // is ignored here and left free for the ScrollView
                    // underneath to interpret as a normal scroll.
                    guard armedEventID == item.event.id else { return }
                    draggingEventID = item.event.id
                    dragOffsetMinutes = minutesDelta(fromTranslation: value.translation.height)
                }
                .onEnded { value in
                    defer { armedEventID = nil }
                    guard armedEventID == item.event.id else { return }
                    let delta = minutesDelta(fromTranslation: value.translation.height)
                    store.moveEvent(item.event.id, newStart: item.event.startDate.addingTimeInterval(TimeInterval(delta * 60)))
                    draggingEventID = nil
                    dragOffsetMinutes = 0
                }
        )
    }

    @ViewBuilder
    private func currentTimeLine(contentWidth: CGFloat) -> some View {
        if dayOffset == 0 {
            let nowMinutes = minutesFromMidnight(Date())
            if nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 {
                Rectangle()
                    .fill(Color.red)
                    .frame(width: contentWidth, height: 2)
                    .offset(x: leftGutter, y: yOffset(forMinutes: nowMinutes))
            }
        }
    }

    // MARK: - Time/position math

    private func minutesFromMidnight(_ date: Date) -> Int {
        let comps = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
    }

    private func yOffset(forMinutes minutes: Int) -> CGFloat {
        CGFloat(minutes - startHour * 60) / 30 * slotHeight
    }

    private func minutes(fromY y: CGFloat) -> Int {
        let raw = Int((y / slotHeight) * 30)
        let snapped = (raw / 30) * 30
        return max(startHour * 60, startHour * 60 + snapped)
    }

    private func minutesDelta(fromTranslation dy: CGFloat) -> Int {
        let raw = Int((dy / slotHeight) * 30)
        return (raw / 30) * 30
    }

    private func timeLabel(_ minutes: Int) -> String {
        let hour24 = minutes / 60
        let minute = minutes % 60
        let period = hour24 < 12 ? "AM" : "PM"
        var hour12 = hour24 % 12
        if hour12 == 0 { hour12 = 12 }
        return minute == 0 ? "\(hour12) \(period)" : String(format: "%d:%02d %@", hour12, minute, period)
    }
}

