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
    var accent: Color = .vectisTeal

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
    static let vectisTeal = Color(hex: "1C8C82")

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
    milestoneColorHex: String = "#1C8C82"
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

