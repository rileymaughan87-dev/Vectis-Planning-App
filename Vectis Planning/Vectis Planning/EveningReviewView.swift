import SwiftUI

/// The evening half of Plan and Review.
///
/// Ordered deliberately: what got done comes first, flagged misses
/// second, the written reflection last. Self-efficacy is the mechanism
/// behind why reflection works (Di Stefano et al.) — a review that
/// opens with shortfalls works against its own purpose. Same data as a
/// deficit-first review would show, just reordered so the review builds
/// "I did things today" before anything else.
struct EveningReviewView: View {
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var journalStore: JournalStore
    @ObservedObject var planReviewStore: PlanReviewStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var reflectionText: String = ""

    private let today = Date()

    private var todaysGoals: [Goal] {
        // isScheduled(on:) only looks at frequency type — it says
        // nothing about whether a goal is daily-trackable at all. A
        // long-term goal like "Finish degree" has no daily completion
        // concept (it tracks milestones instead), so it needs excluding
        // here explicitly rather than assumed away.
        goalsStore.goals.filter { $0.kind == .shortTerm && $0.isScheduled(on: today) }
    }

    private var completedGoals: [Goal] {
        todaysGoals.filter { $0.isCompletedToday }
    }

    /// Only surfaced when the sub-toggle is on — flagging every miss
    /// regardless would turn this into exactly the nagging the app
    /// avoids elsewhere. `missNudge` itself already stays quiet below
    /// two consecutive misses.
    private var flaggedGoals: [Goal] {
        guard planReviewStore.flagRepeatedMisses else { return [] }
        return todaysGoals.filter { $0.missNudge != nil }
    }

    /// A day with misses gets the diagnostic question; an otherwise
    /// clean day gets the positive one. Ties the prompt itself to the
    /// same lead-with-what-went-well principle as the ordering above.
    private var prompt: String {
        flaggedGoals.isEmpty ? "What worked today?" : "What slowed you down today?"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    doneSection
                    if !flaggedGoals.isEmpty {
                        flaggedSection
                    }
                    reflectionSection
                }
                .padding()
            }
            .navigationTitle("Evening review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { save() }
                }
            }
            .onAppear {
                reflectionText = journalStore.entry(for: today)?.text ?? ""
            }
        }
    }

    private var doneSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today")
                .font(.title3.weight(.semibold))

            if todaysGoals.isEmpty {
                Text("Nothing scheduled today.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text("\(completedGoals.count) of \(todaysGoals.count) done")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                // Every scheduled goal, not just the completed ones —
                // reviewing is a natural moment to catch something you
                // actually did but never ticked off, so it needs to be
                // tappable here, not just a static list of what's done.
                ForEach(todaysGoals) { goal in
                    Button {
                        goalsStore.setToday(goal.id, done: !goal.isCompletedToday)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: goal.isCompletedToday ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(goal.isCompletedToday ? appearanceStore.primaryColor : .secondary)
                            Text(goal.title)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .strikethrough(goal.isCompletedToday)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var flaggedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            ForEach(flaggedGoals) { goal in
                VStack(alignment: .leading, spacing: 2) {
                    Text(goal.title)
                        .font(.subheadline.weight(.medium))
                    if let nudge = goal.missNudge {
                        Text(nudge)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var reflectionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Text(prompt)
                .font(.subheadline.weight(.medium))
                .italic()
            TextEditor(text: $reflectionText)
                .font(.body)
                .frame(minHeight: 100)
                .scrollContentBackground(.hidden)
                .background(
                    RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                        .fill(Color(.secondarySystemGroupedBackground))
                )
            Text("Optional — skipping is fine. Answering is what starts today's journal entry.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func save() {
        let trimmed = reflectionText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            journalStore.seedReflection(date: today, prompt: prompt)
            journalStore.setText(date: today, text: trimmed)
        }
        dismiss()
    }
}

