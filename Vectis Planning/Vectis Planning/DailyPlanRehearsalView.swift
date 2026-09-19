import SwiftUI

/// What the "Daily planning" button opens for now.
///
/// This is deliberately NOT the full morning-planning feature from the
/// spec (popup for capture, tray, drag-to-place) — that's a much bigger
/// piece of work and isn't built yet. This is the honest, small thing
/// that already exists: a quick read-only look at what's scheduled
/// today, matching what the "Rehearse your plans" sub-toggle already
/// promises. A real, useful screen on its own, not a placeholder
/// pretending to be something bigger.
struct DailyPlanRehearsalView: View {
    @ObservedObject var store: CalendarStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    let date: Date

    @Environment(\.dismiss) private var dismiss

    private var scheduledGoals: [Goal] {
        goalsStore.goals.filter { $0.isScheduled(on: date) }
    }

    private var timedEvents: [CalendarEvent] {
        store.timedEvents(on: date)
            .filter { $0.flowsToDaily && !$0.isAllDay }
            .sorted { $0.startDate < $1.startDate }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("A quick look at today before it starts.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if !timedEvents.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("On the calendar")
                                .font(.headline)
                            ForEach(timedEvents) { event in
                                HStack(spacing: 10) {
                                    Text(event.startDate.formatted(date: .omitted, time: .shortened))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .frame(width: 60, alignment: .leading)
                                    Text(event.title)
                                        .font(.subheadline)
                                }
                            }
                        }
                    }

                    if !scheduledGoals.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Goals today")
                                .font(.headline)
                            ForEach(scheduledGoals) { goal in
                                HStack(spacing: 8) {
                                    Image(systemName: "target")
                                        .foregroundStyle(appearanceStore.primaryColor)
                                    Text(goal.title)
                                        .font(.subheadline)
                                }
                            }
                        }
                    }

                    if timedEvents.isEmpty && scheduledGoals.isEmpty {
                        Text("Nothing scheduled today.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Today's plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
