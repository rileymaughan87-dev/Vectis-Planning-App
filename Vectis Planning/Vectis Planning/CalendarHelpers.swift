import SwiftUI
import UIKit

// MARK: - Hex color

// MARK: - Design tokens

/// Shared sizing constants so the app's visual style — sharp, squared-off
/// corners rather than soft rounded "bubbles" — is defined once and stays
/// consistent everywhere, instead of each screen picking its own radius.
enum DesignTokens {
    static let cardRadius: CGFloat = 6
    static let smallRadius: CGFloat = 4
}

/// A bordered box wrapping a whole section, with a coloured accent
/// stripe beside its title.
///
/// Shared between the Goals and Home pages rather than each defining
/// its own, so the two can't drift apart as either gets tweaked.
struct SectionBox<Content: View>: View {
    let title: String
    let accent: Color
    var subtitle: String? = nil
    var contentSpacing: CGFloat = 14
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(accent)
                    .frame(width: 4, height: 20)
                Text(title)
                    .font(.title3.weight(.bold))
                Spacer()
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            VStack(spacing: contentSpacing) {
                content()
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .strokeBorder(accent.opacity(0.35), lineWidth: 1.5)
        )
    }
}

/// Squared-off, solid buttons matching the app's boxy style, rather than
/// iOS's translucent tinted capsules.
///
/// Applied to the prominent action buttons — Add, Create, the check-in
/// answers. Destructive rows inside a `Form` are deliberately left as
/// stock red text: those render as plain rows rather than bubbles, and
/// restyling them would look wrong against the grouped form around them.
struct VectisButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, destructive }

    var kind: Kind = .secondary
    var accent: Color = .vectisBlue

    func makeBody(configuration: Configuration) -> some View {
        let fill: Color
        let fg: Color
        switch kind {
        case .primary:
            fill = accent
            fg = accent.contrastingTextColor
        case .secondary:
            fill = Color(.secondarySystemGroupedBackground)
            fg = accent
        case .destructive:
            fill = Color(.secondarySystemGroupedBackground)
            fg = .red
        }

        return configuration.label
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .foregroundStyle(fg)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .strokeBorder(
                        kind == .primary ? Color.clear : accent.opacity(0.3),
                        lineWidth: 1
                    )
            )
            .opacity(configuration.isPressed ? 0.65 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension Color {
    /// The app's signature color, used as the tint for buttons, the
    /// selected tab, toggles, and anywhere else the system would
    /// otherwise default to plain iOS blue.
    static let vectisBlue = Color(hex: "0068B5")

    /// A secondary accent, reusing the same terracotta originally
    /// designed for the Challenges category. Used specifically to tell
    /// Long-term goals apart from Short-term at a glance, rather than
    /// as a general-purpose second color sprinkled everywhere.
    static let vectisCoral = Color(hex: "D2574A")

    /// Builds a Color from a hex string like "#4A7FE8", matching how
    /// CalendarCategory stores its color. This is what lets a category
    /// you create in Settings actually show up as real color on screen.
    init(hex: String) {
        let sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        var rgb: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&rgb)
        let red = Double((rgb & 0xFF0000) >> 16) / 255
        let green = Double((rgb & 0x00FF00) >> 8) / 255
        let blue = Double(rgb & 0x0000FF) / 255
        self.init(red: red, green: green, blue: blue)
    }

    /// A darker version of this colour, for borders and edges.
    ///
    /// Multiplying the channels keeps the same hue rather than washing
    /// toward grey, so a border reads as "the same colour, deeper"
    /// instead of a separate outline sitting on top.
    func darkened(by amount: Double = 0.25) -> Color {
        let ui = UIColor(self)
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        ui.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let factor = max(0, 1 - amount)
        return Color(red: red * factor, green: green * factor, blue: blue * factor, opacity: alpha)
    }

    /// Black or white, whichever is readable on top of this colour.
    ///
    /// Now that event blocks are filled solid rather than tinted, a
    /// fixed white label would vanish on light categories (a pale
    /// yellow, say) and a fixed black one would vanish on dark ones.
    /// This picks per-colour using perceived brightness, which weights
    /// green most and blue least — matching how the eye actually works.
    var contrastingTextColor: Color {
        let ui = UIColor(self)
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        ui.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let brightness = (red * 299 + green * 587 + blue * 114) / 1000
        return brightness > 0.6 ? .black : .white
    }

    /// The reverse — turns a Color picked from Settings' ColorPicker
    /// back into a hex string for storage, since CalendarCategory saves
    /// its color as plain text rather than a SwiftUI-specific type.
    var hexString: String {
        let uiColor = UIColor(self)
        guard let components = uiColor.cgColor.components, components.count >= 3 else {
            return "#000000"
        }
        let red = Int(components[0] * 255)
        let green = Int(components[1] * 255)
        let blue = Int(components[2] * 255)
        return String(format: "#%02X%02X%02X", red, green, blue)
    }
}

// MARK: - Overlap layout

/// A CalendarEvent plus where it should sit horizontally when it
/// overlaps with others — which column it's in, and how many columns
/// its overlapping cluster is split into.
struct LaidOutEvent: Identifiable {
    let event: CalendarEvent
    let column: Int
    let columnCount: Int
    var id: UUID { event.id }
}

/// Everything that takes up time on a given day: timed events, goals
/// scheduled to the calendar, and placed tasks.
///
/// One definition shared by the Daily grid, Home's "Right now", and the
/// planning commitment bar. Each used to build its own list, and they
/// drifted: Home left out placed tasks, so it said "Nothing scheduled"
/// in the middle of one.
enum DayBlocks {
    static func blocks(
        on date: Date,
        calendarStore: CalendarStore,
        goalsStore: GoalsStore,
        tasksStore: TasksStore
    ) -> [CalendarEvent] {
        // All-day events are deliberately excluded — there's no time
        // slot to draw them in. They show on the Long-Term calendar.
        let realEvents = calendarStore.timedEvents(on: date)
            .filter { $0.flowsToDaily && !$0.isAllDay }

        // Goals scheduled to the calendar are synthesised rather than
        // stored, so they always match the goal's current settings.
        let fallbackCategory = calendarStore.categories.first?.id ?? UUID()
        let goalBlocks = goalsStore.goals.compactMap { goal in
            goal.scheduledBlock(on: date, categoryID: goal.categoryID ?? fallbackCategory)
        }

        // A placed task becomes a transient block too, so it gets the
        // same overlap/column handling as everything else on the grid.
        let calendar = Calendar.current
        let taskBlocks: [CalendarEvent] = tasksStore.tasks.compactMap { task in
            guard let scheduled = task.scheduledDate,
                  calendar.isDate(scheduled, inSameDayAs: date),
                  let duration = task.durationMinutes
            else { return nil }
            var event = CalendarEvent(
                title: task.text,
                startDate: scheduled,
                endDate: scheduled.addingTimeInterval(TimeInterval(duration * 60)),
                categoryID: fallbackCategory
            )
            // A stable id, not a fresh random one each redraw — otherwise
            // the id changes out from under a drag in progress. A task
            // has only one placement at a time, so its own id will do.
            event.id = task.id
            event.flowsToDaily = true
            event.linkedTaskID = task.id
            event.isCompleted = task.done
            return event
        }

        return realEvents + goalBlocks + taskBlocks
    }
}

/// Packs a day's events into side-by-side columns wherever they overlap
/// in time, same idea as Google Calendar. Events that don't overlap
/// anything else just get the full width (columnCount == 1).
///
/// The approach: group events into "clusters" of mutually-overlapping
/// events first, then within each cluster, greedily assign each event
/// to the first column whose previous occupant has already finished.
func layoutEvents(_ events: [CalendarEvent]) -> [LaidOutEvent] {
    let sorted = events.sorted { $0.startDate < $1.startDate }

    var clusters: [[CalendarEvent]] = []
    var current: [CalendarEvent] = []
    var clusterEnd = Date.distantPast

    for event in sorted {
        if current.isEmpty || event.startDate < clusterEnd {
            current.append(event)
            clusterEnd = max(clusterEnd, event.endDate)
        } else {
            clusters.append(current)
            current = [event]
            clusterEnd = event.endDate
        }
    }
    if !current.isEmpty { clusters.append(current) }

    var result: [LaidOutEvent] = []
    for cluster in clusters {
        var columnEnds: [Date] = []
        var columnByID: [UUID: Int] = [:]

        for event in cluster {
            var placed = false
            for i in 0..<columnEnds.count {
                if columnEnds[i] <= event.startDate {
                    columnEnds[i] = event.endDate
                    columnByID[event.id] = i
                    placed = true
                    break
                }
            }
            if !placed {
                columnEnds.append(event.endDate)
                columnByID[event.id] = columnEnds.count - 1
            }
        }

        let columnCount = columnEnds.count
        for event in cluster {
            result.append(LaidOutEvent(event: event, column: columnByID[event.id] ?? 0, columnCount: columnCount))
        }
    }
    return result
}

/// A tiny Identifiable wrapper so `.sheet(item:)` can be driven by a
/// plain (start, end) minute range, since that range itself isn't a
/// type that conforms to Identifiable on its own.
struct MinuteRange: Identifiable {
    let id = UUID()
    let start: Int
    let end: Int
}

/// Same idea, but wrapping a plain Date so it can drive a `.sheet(item:)`
/// too — used when tapping a day on the Long-Term month view.
struct IdentifiableDate: Identifiable {
    let id = UUID()
    let date: Date
}

/// One thing showing up on a given day of the Long-Term calendar — either
/// a real CalendarEvent, or a goal's milestone that's been scheduled with
/// a date. Merging both into one shape is what lets the month view and
/// day popup treat "a meeting" and "submit thesis proposal" the same way
/// when drawing dots and rows, even though they're really two different
/// kinds of data underneath.
struct LongTermDayItem: Identifiable {
    let id: UUID
    let title: String
    let colorHex: String
    let isMilestone: Bool
}

/// Everything scheduled on a given day for the Long-Term calendar:
/// events not flagged for the Daily calendar, plus any milestone with
/// a calendar date landing on that day.
///
/// `milestoneColorHex` is passed in rather than hardcoded so milestones
/// pick up whatever secondary color the current appearance scheme uses.
func longTermDayItems(
    on date: Date,
    calendarStore: CalendarStore,
    goalsStore: GoalsStore,
    milestoneColorHex: String = "#0068B5"
) -> [LongTermDayItem] {
    let calendar = Calendar.current
    var result: [LongTermDayItem] = []

    // Uses `occupies` rather than matching the start date, so a holiday
    // spanning a week appears on all seven days rather than only its
    // first — and repeating events show on each occurrence.
    //
    // Filters on `origin`, NOT `flowsToDaily`. Those answer different
    // questions: flowsToDaily is "does this also get a slot on the
    // Daily grid", origin is "which screen was this made on". Using
    // flowsToDaily here meant a timed event created in Long-Term
    // disappeared from Long-Term, because giving it a time set that
    // flag and the filter read it as "hide".
    let events = calendarStore.events.filter { $0.occupies(date) && $0.origin == .longTerm }
    for event in events {
        let hex = calendarStore.category(for: event.categoryID)?.colorHex ?? "#999999"
        result.append(LongTermDayItem(id: event.id, title: event.title, colorHex: hex, isMilestone: false))
    }

    // Milestones get their own distinct color so they read as
    // "goal-related" at a glance, separate from a category color.
    for goal in goalsStore.longTermGoals {
        for milestone in goal.milestones where milestone.addToCalendar {
            if let milestoneDate = milestone.date, calendar.isDate(milestoneDate, inSameDayAs: date) {
                result.append(LongTermDayItem(id: milestone.id, title: milestone.title, colorHex: milestoneColorHex, isMilestone: true))
            }
        }
    }
    return result
}

// MARK: - Shared editor pieces

/// A bordered box with an accent stripe beside its title — the same
/// shape `SectionBox` gives the Goals and Home screens, so the editors
/// stop looking like stock iOS Settings and start looking like the rest
/// of this app.
struct EditorBox<Content: View>: View {
    let title: String
    let accent: Color
    var trailing: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(accent)
                    .frame(width: 4, height: 16)
                Text(title)
                    .font(.subheadline.weight(.medium))
                Spacer()
                if let trailing {
                    Text(trailing)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            content()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }
}

/// A collapsed row standing in for a whole section, showing a summary of
/// what's inside so nothing becomes invisible just because it's folded
/// away — you can see that something repeats, and how, without opening it.
struct EditorSummaryRow: View {
    let title: String
    let summary: String

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                Text(summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }
}

/// Category as tappable colour chips rather than a text menu. The colour
/// is real information the old picker hid — worth surfacing, though it
/// would need rethinking past roughly five or six categories, since
/// chips wrap rather than scroll.
struct CategoryChips: View {
    let categories: [CalendarCategory]
    @Binding var selection: UUID?

    var body: some View {
        FlowRow(spacing: 6) {
            ForEach(categories) { category in
                chip(for: category)
            }
        }
    }

    private func chip(for category: CalendarCategory) -> some View {
        let color = Color(hex: category.colorHex)
        let isSelected = selection == category.id
        return Button {
            selection = category.id
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(category.name)
                    .font(.caption)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(isSelected ? color.opacity(0.15) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .strokeBorder(isSelected ? color : Color(.separator), lineWidth: isSelected ? 1.5 : 0.5)
            )
            .foregroundStyle(isSelected ? .primary : .secondary)
        }
        .buttonStyle(.plain)
    }
}

/// Wraps its children onto new lines when they run out of width, which
/// a plain HStack won't do. Needed for the category chips, since how
/// many fit per row depends on the names.
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // Falls back to the screen width rather than infinity — an
        // unconstrained proposal should be rare here since this always
        // sits inside a screen-width ScrollView, but reporting infinity
        // if it ever happened would make the whole row refuse to wrap.
        let maxWidth = proposal.width ?? (UIScreen.main.bounds.width - 60)
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// The editor's first box: a big title field with an accent stripe down
/// its left edge, so the item's colour shows the moment it opens.
struct EditorTitleBox: View {
    var label: String = "Title"
    let placeholder: String
    @Binding var text: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .font(.title3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Rectangle().fill(Color(.secondarySystemGroupedBackground))
        )
        .overlay(alignment: .leading) {
            Rectangle().fill(accent).frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous))
    }
}

/// A labelled time-of-day field in a small inset box — half-width, so
/// two fit side by side ("Starts" / "Ends").
struct EditorTimeField: View {
    let label: String
    @Binding var selection: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            // Time-only, not date-and-time — a compact picker showing
            // both ("9/18/26, 10:00 AM") is too wide for two of these
            // side by side. scaleEffect doesn't help here: it shrinks
            // how a view LOOKS, not the space SwiftUI reserves for it.
            DatePicker("", selection: $selection, displayedComponents: .hourAndMinute)
                .labelsHidden()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                .fill(Color(.tertiarySystemGroupedBackground))
        )
    }
}

/// Text options with a 2pt underline on the selected one — the design
/// system's switcher for a fixed set of choices (the Record tab's
/// sections, a goal's "Track by"). Filled chips are kept for lists the
/// person edits, like categories.
struct UnderlineSelector<Option: Hashable>: View {
    let options: [(value: Option, label: String)]
    @Binding var selection: Option
    let accent: Color
    var verticalPadding: CGFloat = 12
    var horizontalPadding: CGFloat = 0

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.value) { option in
                let isSelected = selection == option.value
                Button {
                    selection = option.value
                } label: {
                    Text(option.label)
                        .font(.caption.weight(isSelected ? .semibold : .regular))
                        .foregroundStyle(isSelected ? accent : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, verticalPadding)
                        .overlay(alignment: .bottom) {
                            Rectangle()
                                .fill(isSelected ? accent : Color.clear)
                                .frame(height: 2)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.horizontal, horizontalPadding)
        .background(
            Rectangle()
                .fill(Color(.separator).opacity(0.5))
                .frame(height: 0.5),
            alignment: .bottom
        )
    }
}

