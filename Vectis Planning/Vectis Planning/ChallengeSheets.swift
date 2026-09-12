import SwiftUI

/// The catalog of challenges you can start — 75 Hard, Whole30 and so on,
/// loaded from Challenges.json.
struct ChallengeBrowserSheet: View {
    @ObservedObject var store: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var templates: [ChallengeTemplate] = []
    @State private var selectedTemplate: ChallengeTemplate?

    var body: some View {
        NavigationStack {
            List {
                if templates.isEmpty {
                    Text("No challenges found. Check that Challenges.json is included in the app target.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ForEach(templates) { template in
                    Button {
                        selectedTemplate = template
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(template.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text("\(template.durationDays) days")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Text(template.tagline)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(template.tasks.count) daily task\(template.tasks.count == 1 ? "" : "s")")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Challenges")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear { templates = ChallengeCatalog.load() }
            .sheet(item: $selectedTemplate) { template in
                ChallengeDetailSheet(
                    template: template,
                    store: store,
                    appearanceStore: appearanceStore,
                    onStarted: { dismiss() }
                )
            }
        }
    }
}

/// One challenge in full: what it involves, which tasks to include,
/// when to start, and whether to enforce the restart-on-miss rule.
struct ChallengeDetailSheet: View {
    let template: ChallengeTemplate
    @ObservedObject var store: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    var onStarted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var excludedTasks: Set<String> = []
    @State private var startDate = Date()
    @State private var strictMode = false

    private var includedTasks: [ChallengeTask] {
        template.tasks.filter { !excludedTasks.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(template.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    ForEach(template.tasks) { task in
                        Button {
                            if excludedTasks.contains(task.id) {
                                excludedTasks.remove(task.id)
                            } else {
                                excludedTasks.insert(task.id)
                            }
                        } label: {
                            HStack {
                                CompletionMark(
                                    isOn: !excludedTasks.contains(task.id),
                                    size: 18,
                                    color: appearanceStore.primaryColor
                                )
                                Text(task.title)
                                    .font(.subheadline)
                                    .foregroundStyle(excludedTasks.contains(task.id) ? .secondary : .primary)
                                    .strikethrough(excludedTasks.contains(task.id))
                                Spacer()
                            }
                        }
                    }
                } header: {
                    Text("Daily tasks")
                } footer: {
                    Text("\(includedTasks.count) of \(template.tasks.count) will be added as daily habits. Uncheck anything you'd rather skip.")
                }

                Section("Start date") {
                    DatePicker("Starts", selection: $startDate, displayedComponents: .date)
                }

                if template.supportsStrictMode {
                    Section {
                        Toggle("Strict mode", isOn: $strictMode)
                        if strictMode, let disclaimer = template.strictModeDisclaimer {
                            Text(disclaimer)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } header: {
                        Text("Rules")
                    }
                }

                Section {
                    Button("Start \(template.name)") {
                        store.startChallenge(
                            template,
                            selectedTasks: includedTasks,
                            startDate: startDate,
                            strictMode: strictMode
                        )
                        dismiss()
                        onStarted()
                    }
                    .disabled(includedTasks.isEmpty)
                } footer: {
                    if includedTasks.isEmpty {
                        Text("Pick at least one task to start.")
                    } else {
                        Text("Creates a long-term goal with \(includedTasks.count) linked daily habit\(includedTasks.count == 1 ? "" : "s"). You can edit or remove any of them afterwards.")
                    }
                }
            }
            .navigationTitle(template.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// Shown when a challenge has past days with no record either way —
/// days you were away and never confirmed.
///
/// The app deliberately doesn't assume a miss just because a day passed
/// unconfirmed. It only knows you didn't open it, which isn't the same
/// as knowing you didn't do the thing.
struct ChallengeCatchUpSheet: View {
    let goal: Goal
    @ObservedObject var store: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var resolved: Set<String> = []
    @State private var reportedMiss = false

    private var days: [Date] {
        store.unresolvedDays(for: goal)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("You were away for \(days.count) day\(days.count == 1 ? "" : "s"). Did you complete every task each day?")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(days, id: \.self) { day in
                    let key = Goal.dayKey(day)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(day.formatted(date: .complete, time: .omitted))
                            .font(.subheadline.weight(.medium))

                        if resolved.contains(key) {
                            Text("Recorded")
                                .font(.caption)
                                .foregroundStyle(appearanceStore.primaryColor)
                        } else {
                            HStack(spacing: 8) {
                                Button("Yes, completed") {
                                    store.resolveDay(goal, date: day, completed: true)
                                    resolved.insert(key)
                                }
                                .buttonStyle(VectisButtonStyle(kind: .primary, accent: appearanceStore.primaryColor))

                                Button("No, missed it") {
                                    store.resolveDay(goal, date: day, completed: false)
                                    resolved.insert(key)
                                    if goal.challengeStrictMode { reportedMiss = true }
                                }
                                .buttonStyle(VectisButtonStyle(kind: .destructive))
                            }
                            .font(.caption)
                        }
                    }
                    .padding(.vertical, 2)
                }

                if reportedMiss {
                    Section {
                        Button("Restart from day one", role: .destructive) {
                            store.restartChallenge(goal.id)
                            dismiss()
                        }
                    } footer: {
                        Text("Strict mode is on, so a missed day means restarting. Your previous attempt stays in your history.")
                    }
                }
            }
            .navigationTitle("Catching up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

