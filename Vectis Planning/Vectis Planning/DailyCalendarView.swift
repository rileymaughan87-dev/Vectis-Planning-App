import SwiftUI

/// A small drag target at the bottom edge of an event block, for
/// changing its end time without moving the whole thing.
///
/// Deliberately its own gesture rather than reusing the long-press-then-
/// drag pattern used to move a block: the handle itself is a small,
/// precise target, so it doesn't need that same protection against
/// being mistaken for a scroll — a touch has to start right on this
/// strip to begin with.
/// Renders a segmented event's parts stacked inside its block, each
/// sized proportionally to its share of the parts' total estimate.
///
/// Proportional to each other rather than to real clock minutes — if
/// the parts haven't been reconciled with the block's actual duration
/// (see the editor's "extend to match" choice), the block's own real
/// height stays authoritative and parts simply divide whatever space
/// that actually is.
///
/// Its own named view for the same reason as `HistoryStrip` elsewhere
/// in this app: building a `ForEach` with this much conditional layout
/// inline, inside the already-complex `eventBlock` function, is exactly
/// the shape of expression that has previously timed out the compiler.
/// The small popup shown when tapping the review block on the
/// calendar — a deliberate extra step before the full review opens,
/// rather than jumping straight in from a single tap.
/// The small popup shown when tapping a placed task on the calendar —
/// a task has no full editor, so this is its whole interaction: mark
/// it done, or take it back off the calendar.
private struct TaskActionSheet: View {
    let task: VectisTask
    @ObservedObject var tasksStore: TasksStore
    let accentColor: Color
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle")
                .font(.title)
                .foregroundStyle(accentColor)
            Text(task.text)
                .font(.headline)
                .multilineTextAlignment(.center)

            Button(task.done ? "Mark not done" : "Mark done") {
                tasksStore.toggle(task.id)
                onDismiss()
            }
            .buttonStyle(VectisButtonStyle(kind: .primary, accent: accentColor))

            Button("Take off the calendar") {
                tasksStore.unplace(task.id)
                onDismiss()
            }
            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))
        }
        .padding(24)
    }
}

private struct ReviewPromptSheet: View {
    let accentColor: Color
    let onStart: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "text.book.closed.fill")
                .font(.title)
                .foregroundStyle(accentColor)
            Text("Evening review")
                .font(.headline)
            Text("A quick look back, and a line or two if you want.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Start review") { onStart() }
                .buttonStyle(VectisButtonStyle(kind: .primary, accent: accentColor))

            Button("Not now") { dismiss() }
                .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))
        }
        .padding(24)
    }
}

/// One draggable chip in the planning tray. The drag payload is a
/// plain "source:uuid" string — simple enough that String itself can
/// be the Transferable type, no custom payload struct needed.
private struct PlanningTrayChip: View {
    let item: PlanningItem
    let accentColor: Color

    private var isGoal: Bool {
        if case .goal = item.source { return true }
        return false
    }

    private var payload: String {
        switch item.source {
        case .goal(let goal): return "goal:\(goal.id.uuidString)"
        case .task(let task): return "task:\(task.id.uuidString)"
        }
    }

    private var durationText: String {
        let h = item.durationMinutes / 60
        let m = item.durationMinutes % 60
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: isGoal ? "target" : "checkmark.circle")
                .font(.caption2)
            VStack(alignment: .leading, spacing: 0) {
                Text(item.title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Text(durationText)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .fill(accentColor.opacity(0.15))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .strokeBorder(accentColor.opacity(0.4), lineWidth: 1)
        )
        .draggable(payload)
    }
}

private struct PartsStack: View {
    let parts: [EventPart]
    let height: CGFloat
    let textColor: Color

    private var total: Int {
        max(parts.reduce(0) { $0 + $1.estimatedMinutes }, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.element.id) { index, part in
                row(for: part, isFirst: index == 0)
            }
        }
        .frame(height: height, alignment: .top)
        .clipped()
    }

    private func row(for part: EventPart, isFirst: Bool) -> some View {
        let share = CGFloat(part.estimatedMinutes) / CGFloat(total)
        let rowHeight = max(height * share, 3)

        return HStack(spacing: 3) {
            if rowHeight > 10 {
                Text(part.title.isEmpty ? "Untitled" : part.title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
                if rowHeight > 22 {
                    Spacer(minLength: 2)
                    Text("\(part.estimatedMinutes)m")
                        .font(.system(size: 8))
                        .foregroundStyle(textColor.opacity(0.75))
                }
            }
        }
        .padding(.horizontal, 5)
        .frame(height: rowHeight, alignment: .center)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) {
            if !isFirst {
                Rectangle().fill(textColor.opacity(0.25)).frame(height: 0.5)
            }
        }
    }
}

/// The Daily calendar: a scrollable 30-minute time grid for one day.
///
/// Tap an empty slot to add an event, tap an existing one to edit it,
/// press and hold an event to pick it up and move it, and pinch to
/// zoom the grid in or out.
struct DailyCalendarView: View {
    @ObservedObject var store: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    @ObservedObject var peopleStore: PeopleStore
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    @ObservedObject var planReviewStore: PlanReviewStore
    @ObservedObject var journalStore: JournalStore
    @ObservedObject var tasksStore: TasksStore

    @State private var dayOffset = 0

    // These read from CalendarStore now, which Settings can edit.
    private var startHour: Int { store.dailyCalendarStartHour }
    private var endHour: Int { store.dailyCalendarEndHour }
    private let leftGutter: CGFloat = 46

    // Zoom. `slotHeight` is the committed value; `pinchScale` is the
    // live multiplier while a pinch is in progress. @GestureState
    // resets itself to 1 automatically when the gesture ends, so the
    // scale never gets stuck part-way.
    @State private var slotHeight: CGFloat = 24
    @GestureState private var pinchScale: CGFloat = 1
    private let minSlotHeight: CGFloat = 12
    private let maxSlotHeight: CGFloat = 64

    /// What the grid is actually drawn at right now — the committed
    /// height, scaled by any in-progress pinch, clamped to sane bounds.
    private var effectiveSlotHeight: CGFloat {
        min(max(slotHeight * pinchScale, minSlotHeight), maxSlotHeight)
    }

    @State private var pendingRange: MinuteRange?
    @State private var editingEvent: CalendarEvent?
    // The goal AND the day it was tapped on, carried together in one
    // item: a separate @State for the day can reach the sheet stale.
    @State private var editingGoal: GoalOnDay?
    @State private var showingReviewPrompt = false
    @State private var showingFullReview = false
    @State private var showingDailyPlanning = false
    @State private var isPlanning = false
    @State private var taskActionID: UUID?

    // Dragging an event to a new time. An event has to be "armed" by a
    // long press first, so a quick scroll swipe that happens to start
    // on top of an event doesn't get mistaken for moving it.
    @State private var draggingEventID: UUID?
    @State private var dragOffsetMinutes = 0
    @State private var armedEventID: UUID?

    // Resizing a block's end time by its bottom edge — separate from
    // the move-drag above, and its own gesture rather than reusing the
    // long-press-then-drag pattern: the handle is a small, deliberate
    // target, so it doesn't need the same protection against being
    // mistaken for a scroll that moving the whole block does.
    private var currentDate: Date {
        Calendar.current.date(byAdding: .day, value: dayOffset, to: Calendar.current.startOfDay(for: Date())) ?? Date()
    }

    private var totalSlots: Int { (endHour - startHour) * 2 }
    private var gridHeight: CGFloat { CGFloat(totalSlots) * effectiveSlotHeight }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                dayHeader
                if isPlanning {
                    planningTray
                } else if planReviewStore.isEnabled {
                    planReviewButtonsRow
                }
                todaysGoalsStrip
                ScrollView {
                    gridArea
                        .padding(.horizontal)
                        .padding(.bottom, 20)
                }
                // Swipe left/right to change days, alongside the arrow
                // buttons. Attached to the grid only — not the whole
                // screen — so the tray and goals strip above keep their
                // own sideways scrolling. On the whole screen, reaching
                // the end of either strip used to flip to the next day.
                // `simultaneousGesture` so it doesn't compete with the
                // grid's vertical scroll, and the horizontal motion has
                // to clearly dominate so a normal scroll never counts.
                .simultaneousGesture(
                    DragGesture(minimumDistance: 40)
                        .onEnded { value in
                            let horizontal = value.translation.width
                            let vertical = value.translation.height
                            guard abs(horizontal) > abs(vertical) * 1.5 else { return }
                            withAnimation(.easeInOut(duration: 0.2)) {
                                dayOffset += horizontal < 0 ? 1 : -1
                            }
                        }
                )
            }
            .sheet(item: $pendingRange) { range in
                EventEditorSheet(store: store, peopleStore: peopleStore, goalsStore: goalsStore, date: currentDate, startMinutes: range.start, endMinutes: range.end)
            }
            .sheet(item: $editingEvent) { event in
                EventEditorSheet(store: store, peopleStore: peopleStore, goalsStore: goalsStore, editing: event)
            }
            .sheet(item: $editingGoal) { item in
                ShortTermGoalEditorSheet(
                    goal: item.goal,
                    store: goalsStore,
                    linkedAppsStore: linkedAppsStore,
                    peopleStore: peopleStore,
                    accentColor: appearanceStore.primaryColor,
                    openedFromDay: item.day
                )
            }
            .sheet(isPresented: $showingReviewPrompt) {
                ReviewPromptSheet(accentColor: appearanceStore.secondaryColor) {
                    showingReviewPrompt = false
                    showingFullReview = true
                }
                .presentationDetents([.height(320)])
            }
            .sheet(isPresented: $showingFullReview) {
                EveningReviewView(
                    goalsStore: goalsStore,
                    journalStore: journalStore,
                    planReviewStore: planReviewStore,
                    appearanceStore: appearanceStore
                )
            }
            .sheet(isPresented: $showingDailyPlanning) {
                DailyPlanningCaptureView(
                    goalsStore: goalsStore,
                    tasksStore: tasksStore,
                    calendarStore: store,
                    appearanceStore: appearanceStore,
                    date: currentDate,
                    isPlanning: $isPlanning
                )
            }
            .sheet(isPresented: Binding(
                get: { taskActionID != nil },
                set: { if !$0 { taskActionID = nil } }
            )) {
                if let taskID = taskActionID,
                   let task = tasksStore.tasks.first(where: { $0.id == taskID }) {
                    TaskActionSheet(task: task, tasksStore: tasksStore, accentColor: appearanceStore.tertiaryColor) {
                        taskActionID = nil
                    }
                    .presentationDetents([.height(220)])
                }
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
            .accessibilityLabel("Previous day")
            Spacer()
            Text(dayOffset == 0 ? "Today" : currentDate.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                .font(.subheadline.weight(.semibold))
            Spacer()
            Button {
                dayOffset += 1
            } label: {
                Image(systemName: "chevron.right")
            }
            .accessibilityLabel("Next day")
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    /// Buttons rather than calendar blocks — a block anchored to a
    /// time slot got in the way and couldn't be moved once placed,
    /// since there's no per-day override mechanism for it the way
    /// goals and events have. A button just sits above the grid and
    /// opens when tapped, whenever that actually is.
    private var planReviewButtonsRow: some View {
        HStack(spacing: 10) {
            Button {
                showingDailyPlanning = true
            } label: {
                Text("Daily planning")
                    .font(.caption.weight(.medium))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.secondaryColor))

            Button {
                showingReviewPrompt = true
            } label: {
                Text("Review")
                    .font(.caption.weight(.medium))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.secondaryColor))
        }
        .padding(.horizontal)
        // Explicit and equal on both sides, rather than leaning on
        // dayHeader's own bottom inset above and a separate value below
        // — those didn't actually match, which read as lopsided.
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    /// The drag tray — replaces the plan/review buttons while active.
    /// Items are draggable chips; dropping one onto the grid below
    /// calls `handleDrop`, which places it at the dropped time.
    private var planningTray: some View {
        VStack(spacing: 8) {
            let items = PlanningItems.all(goalsStore: goalsStore, tasksStore: tasksStore, date: currentDate)
            HStack {
                Text(items.isEmpty ? "Everything's placed" : "Drag onto the day")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Done placing") {
                    isPlanning = false
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(appearanceStore.primaryColor)
            }

            CommitmentBar(
                fraction: PlanningCommitment.fraction(calendarStore: store, goalsStore: goalsStore, tasksStore: tasksStore, date: currentDate),
                accentColor: appearanceStore.primaryColor
            )

            if !items.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(items) { item in
                            PlanningTrayChip(item: item, accentColor: appearanceStore.tertiaryColor)
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    // MARK: - Goals strip

    @ViewBuilder
    private var todaysGoalsStrip: some View {
        let todaysGoals = goalsStore.standaloneShortTermGoals.filter { $0.isScheduled(on: currentDate) }
        if !todaysGoals.isEmpty {
            let dayKey = Goal.dayKey(currentDate)
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(todaysGoals) { goal in
                            goalChip(goal, dayKey: dayKey)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                Divider()
            }
        }
    }

    private func goalChip(_ goal: Goal, dayKey: String) -> some View {
        let done = goal.completions[dayKey] == true
        return Button {
            // Writes to the day currently on screen, not to today.
            // These two used to disagree: the chip read the viewed day
            // but wrote to today, so ticking something off while
            // looking at yesterday silently marked today instead.
            goalsStore.setCompletion(goal.id, on: currentDate, done: !done)
        } label: {
            HStack(spacing: 6) {
                CompletionMark(isOn: done, size: 15, color: appearanceStore.primaryColor)
                Text(goal.title)
                    .font(.caption)
                    .strikethrough(done)
                    .foregroundStyle(done ? .secondary : .primary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .strokeBorder(
                        done ? Color.clear : appearanceStore.primaryColor.opacity(0.25),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Grid

    private var gridArea: some View {
        GeometryReader { geo in
            let contentWidth = max(geo.size.width - leftGutter - 8, 40)
            ZStack(alignment: .topLeading) {
                // The tap-to-create target sits at the BOTTOM of the
                // stack. Event blocks are drawn above it and handle
                // their own taps, so tapping an event opens it for
                // editing instead of also firing "create here" —
                // which used to queue up two sheets at once.
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        SpatialTapGesture()
                            .onEnded { value in
                                let start = minutes(fromY: value.location.y)
                                pendingRange = MinuteRange(start: start, end: start + 30)
                            }
                    )

                hourLines
                eventsLayer(contentWidth: contentWidth)
                currentTimeLine(contentWidth: contentWidth)
            }
            // The drop target is the whole grid. It used to sit on the
            // events layer, but blocks are placed with `.offset`, which
            // moves what you see without changing the layer's size — so
            // the real drop area was one small box at the top, and none
            // at all on an empty day.
            .modifier(PlanningDropTarget(isActive: isPlanning) { payloads, location in
                handleDrop(payloads: payloads, location: location)
            })
        }
        .frame(height: gridHeight)
        .gesture(
            MagnificationGesture()
                .updating($pinchScale) { value, state, _ in
                    state = value
                }
                .onEnded { value in
                    slotHeight = min(max(slotHeight * value, minSlotHeight), maxSlotHeight)
                }
        )
    }

    private var hourLines: some View {
        ZStack(alignment: .topLeading) {
            ForEach(0...totalSlots, id: \.self) { i in
                let minutes = startHour * 60 + i * 30
                let isHour = minutes % 60 == 0
                Rectangle()
                    .fill(Color(.separator).opacity(isHour ? 0.9 : 0.35))
                    .frame(height: isHour ? 0.5 : 0.5)
                    .offset(y: CGFloat(i) * effectiveSlotHeight)
                if isHour {
                    Text(timeLabel(minutes))
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .offset(y: CGFloat(i) * effectiveSlotHeight - 6)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func eventsLayer(contentWidth: CGFloat) -> some View {
        // Blocks entirely outside the grid's hours (or ending as the
        // day starts, like last night's 10 PM–1 AM on a 6 AM grid) are
        // left out, so they don't take up an overlap column unseen.
        let blocks = DayBlocks.blocks(on: currentDate, calendarStore: store, goalsStore: goalsStore, tasksStore: tasksStore)
            .filter { visibleMinutes(start: $0.startDate, end: $0.endDate) != nil }
        let laidOut = layoutEvents(blocks)
        return ZStack(alignment: .topLeading) {
            ForEach(laidOut) { item in
                eventBlock(item, contentWidth: contentWidth)
            }
        }
    }

    /// Parses a tray item's drag payload ("goal:<uuid>" or
    /// "task:<uuid>") and places it at the dropped time — reusing
    /// `minutes(fromY:)`, the exact same snapping math the tap-to-create
    /// and drag-to-move gestures already use, so a dropped item lands
    /// on the same grid lines everything else does.
    private func handleDrop(payloads: [String], location: CGPoint) -> Bool {
        guard let payload = payloads.first else { return false }
        let parts = payload.split(separator: ":", maxSplits: 1)
        guard parts.count == 2, let id = UUID(uuidString: String(parts[1])) else { return false }

        let startMinutes = minutes(fromY: location.y)
        let calendar = Calendar.current
        let dropDate = calendar.startOfDay(for: currentDate).addingTimeInterval(TimeInterval(startMinutes * 60))

        switch parts[0] {
        case "goal":
            guard let goal = goalsStore.goals.first(where: { $0.id == id }) else { return false }
            goalsStore.scheduleOnCalendar(goal.id, startMinutes: startMinutes, durationMinutes: goal.scheduledDurationMinutes)
        case "task":
            tasksStore.place(id, at: dropDate)
        default:
            return false
        }
        return true
    }

    private func eventBlock(_ item: LaidOutEvent, contentWidth: CGFloat) -> some View {
        let colWidth = contentWidth / CGFloat(item.columnCount)
        let isDragging = draggingEventID == item.event.id
        let isArmed = armedEventID == item.event.id

        // Goal-derived blocks are generated on the fly, not stored, so
        // they behave differently: accent-coloured, tickable, and not
        // editable as events. Task blocks are a third kind, generated
        // the same way — their own colour, and "done" reflects the
        // actual task's own `done` field, since the synthesized event
        // itself never carries real completion state.
        let goalID = item.event.linkedGoalID
        let isGoalBlock = goalID != nil
        let taskID = item.event.linkedTaskID
        let isTaskBlock = taskID != nil
        let linkedTask = taskID.flatMap { id in tasksStore.tasks.first { $0.id == id } }
        let isDone = isTaskBlock ? (linkedTask?.done ?? false) : item.event.isCompleted

        var displayStart = item.event.startDate
        var displayEnd = item.event.endDate
        if isDragging {
            let delta = TimeInterval(dragOffsetMinutes * 60)
            displayStart = item.event.startDate.addingTimeInterval(delta)
            displayEnd = item.event.endDate.addingTimeInterval(delta)
        }

        let visible = visibleMinutes(start: displayStart, end: displayEnd)
            ?? (start: startHour * 60, end: startHour * 60)
        let startMin = visible.start
        let endMin = visible.end
        let top = yOffset(forMinutes: startMin)
        let height = max(yOffset(forMinutes: endMin) - top, 16)

        let baseColor = isGoalBlock
            ? appearanceStore.primaryColor
            : isTaskBlock
                ? appearanceStore.tertiaryColor
                : Color(hex: store.category(for: item.event.categoryID)?.colorHex ?? "#999999")
        let color = isDone ? baseColor.opacity(0.45) : baseColor
        let textColor = baseColor.contrastingTextColor

        return Group {
            if !isGoalBlock, !isTaskBlock, !item.event.parts.isEmpty {
                PartsStack(parts: item.event.parts, height: height, textColor: textColor)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 3) {
                        if isGoalBlock {
                            Image(systemName: isDone ? "checkmark.circle.fill" : "target")
                                .font(.system(size: 9))
                                .foregroundStyle(textColor.opacity(0.9))
                        } else if isTaskBlock {
                            Image(systemName: isDone ? "checkmark.circle.fill" : "checkmark.circle")
                                .font(.system(size: 9))
                                .foregroundStyle(textColor.opacity(0.9))
                        }
                        Text(item.event.title)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(textColor)
                            .strikethrough(isDone)
                            .lineLimit(height > 30 ? 2 : 1)
                    }
                    if height > 34 {
                        Text("\(displayStart.formatted(date: .omitted, time: .shortened)) – \(displayEnd.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 9))
                            .foregroundStyle(textColor.opacity(0.75))
                    }
                }
                .padding(.horizontal, 5)
                .padding(.vertical, 3)
            }
        }
        .frame(width: max(colWidth - 3, 20), height: height, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .fill(color)
        )
        .overlay(
            // A deeper shade of the block's own colour. Gives each event
            // a defined edge — against the white page, and against the
            // next block when two sit side by side in the same slot.
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .strokeBorder(baseColor.darkened(by: 0.3).opacity(isDone ? 0.4 : 1), lineWidth: 1)
        )

        .scaleEffect(isArmed ? 1.04 : 1)
        .shadow(color: .black.opacity(isArmed ? 0.25 : 0), radius: isArmed ? 6 : 0, y: isArmed ? 3 : 0)
        .animation(.easeOut(duration: 0.15), value: isArmed)
        .animation(.easeOut(duration: 0.2), value: isDone)
        .offset(x: leftGutter + CGFloat(item.column) * colWidth, y: top)
        .onTapGesture {
            if let goalID {
                // Opens the goal rather than ticking it off. Tapping
                // used to mark it done, which meant a stray tap while
                // scrolling silently completed something — and the
                // chip strip at the top already handles ticking. An
                // accidentally opened sheet is obvious and cancellable;
                // an accidental completion is neither.
                if let goal = goalsStore.goals.first(where: { $0.id == goalID }) {
                    editingGoal = GoalOnDay(goal: goal, day: currentDate)
                }
            } else if let taskID {
                // A task has no editor to open — tapping shows the
                // small mark-done/remove action popup instead.
                taskActionID = taskID
            } else {
                editingEvent = item.event
            }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.3, maximumDistance: 20)
                .onEnded { _ in
                    // Everything is draggable now, including repeating
                    // events. Moving one occurrence writes a per-day
                    // override rather than shifting the series, which is
                    // what used to make this unsafe.
                    armedEventID = item.event.id
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 2)
                .onChanged { value in
                    guard armedEventID == item.event.id else { return }
                    draggingEventID = item.event.id
                    dragOffsetMinutes = minutesDelta(fromTranslation: value.translation.height)
                }
                .onEnded { value in
                    defer { armedEventID = nil }
                    guard armedEventID == item.event.id else { return }
                    let delta = minutesDelta(fromTranslation: value.translation.height)
                    let newStartMinutes = minutesFromMidnight(item.event.startDate) + delta
                    if let goalID {
                        // This day only — the goal's schedule for every
                        // other day is untouched. Changing the time in
                        // the goal editor is what moves the series.
                        goalsStore.setScheduledTimeOverride(goalID, date: currentDate, startMinutes: newStartMinutes)
                    } else if let taskID {
                        // A task isn't part of a series — moving it
                        // just re-places it at the new time directly.
                        let newStart = item.event.startDate.addingTimeInterval(TimeInterval(delta * 60))
                        tasksStore.place(taskID, at: newStart)
                    } else if item.event.recurrence != .none {
                        // Same rule for a repeating event: this
                        // occurrence moves, the series does not.
                        store.setOccurrenceTime(eventID: item.event.id, date: currentDate, startMinutes: newStartMinutes)
                    } else {
                        // A one-off event has no series to protect, so
                        // it just moves.
                        store.moveEvent(item.event.id, newStart: item.event.startDate.addingTimeInterval(TimeInterval(delta * 60)))
                    }
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
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.red)
                        .frame(width: contentWidth, height: 1.5)
                    Circle()
                        .fill(Color.red)
                        .frame(width: 6, height: 6)
                        .offset(x: -3)
                }
                .offset(x: leftGutter, y: yOffset(forMinutes: nowMinutes))
                .allowsHitTesting(false)
            }
        }
    }

    // MARK: - Time/position math

    private func minutesFromMidnight(_ date: Date) -> Int {
        let comps = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
    }

    /// Minutes from the start of the day being shown — so 1 AM the
    /// next morning is 25 × 60, not 60. Clock-based rather than elapsed
    /// time, so a daylight-saving day still lines up with the labels.
    private func minutesIntoShownDay(_ date: Date) -> Int {
        let calendar = Calendar.current
        let shownDay = calendar.startOfDay(for: currentDate)
        let dayDifference = calendar.dateComponents([.day], from: shownDay, to: calendar.startOfDay(for: date)).day ?? 0
        return dayDifference * 24 * 60 + minutesFromMidnight(date)
    }

    /// The part of a block that falls within the grid's hours, or nil
    /// if none of it does. This is what fixes blocks crossing midnight:
    /// working from clock time alone, 11 PM–12 AM came out as a sliver
    /// (12 AM is minute 0), and an overnight event drew at its start
    /// time on both days.
    private func visibleMinutes(start: Date, end: Date) -> (start: Int, end: Int)? {
        let visibleStart = max(minutesIntoShownDay(start), startHour * 60)
        let visibleEnd = min(minutesIntoShownDay(end), endHour * 60)
        return visibleEnd > visibleStart ? (visibleStart, visibleEnd) : nil
    }

    private func yOffset(forMinutes minutes: Int) -> CGFloat {
        CGFloat(minutes - startHour * 60) / 30 * effectiveSlotHeight
    }

    private func minutes(fromY y: CGFloat) -> Int {
        let raw = Int((y / effectiveSlotHeight) * 30)
        let snapped = (raw / 30) * 30
        return max(startHour * 60, startHour * 60 + snapped)
    }

    private func minutesDelta(fromTranslation dy: CGFloat) -> Int {
        let raw = Int((dy / effectiveSlotHeight) * 30)
        return (raw / 30) * 30
    }

    /// An hour label for the grid's gutter, in the phone's own 12- or
    /// 24-hour style ("6 AM" or "06").
    private func timeLabel(_ minutes: Int) -> String {
        let dayStart = Calendar.current.startOfDay(for: currentDate)
        let date = dayStart.addingTimeInterval(TimeInterval(minutes * 60))
        return date.formatted(.dateTime.hour())
    }
}


/// Accepts tray drops only while planning. Attached unconditionally, a
/// drop destination competes with the long-press-then-drag gesture used
/// to move existing blocks — two touch systems on one view don't share
/// nicely — so it's switched on only while the tray is showing.
private struct PlanningDropTarget: ViewModifier {
    let isActive: Bool
    let onDrop: ([String], CGPoint) -> Bool

    func body(content: Content) -> some View {
        if isActive {
            content.dropDestination(for: String.self) { payloads, location in
                onDrop(payloads, location)
            }
        } else {
            content
        }
    }
}

/// A goal opened from one day of the Daily planner.
struct GoalOnDay: Identifiable {
    let goal: Goal
    let day: Date
    var id: UUID { goal.id }
}
