import SwiftUI

/// The Linked apps page from the sidebar: what's currently linked to
/// what, which catalog apps are available on this phone, and a way to
/// add anything missing by URL scheme.
struct LinkedAppsView: View {
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var categories: [LinkableAppCategory] = []
    @State private var showingAddCustom = false

    /// Goals that currently have an app linked.
    private var linkedGoals: [Goal] {
        goalsStore.goals.filter { $0.linkedAppScheme != nil }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Current links") {
                    if linkedGoals.isEmpty {
                        Text("Nothing linked yet. Open a goal and pick an app to link it.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(linkedGoals) { goal in
                        HStack(spacing: 11) {
                            Image(systemName: symbolFor(goal))
                                .foregroundStyle(colorFor(goal))
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(goal.linkedAppName ?? "App")
                                    .font(.subheadline.weight(.medium))
                                Label(goal.title, systemImage: "target")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button {
                                unlink(goal)
                            } label: {
                                Image(systemName: "link.badge.plus")
                                    .rotationEffect(.degrees(45))
                                    .foregroundStyle(.secondary)
                            }
                            .accessibilityLabel("Unlink app")
                            .buttonStyle(.plain)
                        }
                    }
                }

                ForEach(categories) { category in
                    let available = category.apps.filter { AppLauncher.isInstalled($0.scheme) }
                    if !available.isEmpty {
                        Section(category.name) {
                            ForEach(available) { app in
                                HStack(spacing: 11) {
                                    Image(systemName: app.sfSymbol)
                                        .foregroundStyle(LinkedAppsCatalog.color(for: app.id))
                                        .frame(width: 22)
                                    Text(app.name)
                                        .font(.subheadline)
                                    Spacer()
                                }
                            }
                        }
                    }
                }

                if !linkedAppsStore.customApps.isEmpty {
                    Section("Custom") {
                        ForEach(linkedAppsStore.customApps) { app in
                            HStack(spacing: 11) {
                                Image(systemName: "app.dashed")
                                    .foregroundStyle(.secondary)
                                    .frame(width: 22)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(app.name).font(.subheadline)
                                    Text(app.scheme)
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                linkedAppsStore.deleteCustomApp(linkedAppsStore.customApps[index].id)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        showingAddCustom = true
                    } label: {
                        Label("Add a custom app", systemImage: "plus")
                    }
                } footer: {
                    Text("Only apps installed on this phone are listed. Link one to a goal from the goal's own editor.")
                }
            }
            .navigationTitle("Linked apps")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear { categories = LinkedAppsCatalog.load() }
            .sheet(isPresented: $showingAddCustom) {
                AddCustomAppSheet(store: linkedAppsStore, appearanceStore: appearanceStore)
            }
        }
    }

    private func symbolFor(_ goal: Goal) -> String {
        guard let appID = goal.linkedAppID else { return "app.dashed" }
        for category in categories {
            if let app = category.apps.first(where: { $0.id == appID }) {
                return app.sfSymbol
            }
        }
        return "app.dashed"
    }

    private func colorFor(_ goal: Goal) -> Color {
        guard let appID = goal.linkedAppID else { return .secondary }
        return LinkedAppsCatalog.color(for: appID)
    }

    private func unlink(_ goal: Goal) {
        guard let index = goalsStore.goals.firstIndex(where: { $0.id == goal.id }) else { return }
        goalsStore.goals[index].linkedAppScheme = nil
        goalsStore.goals[index].linkedAppName = nil
        goalsStore.goals[index].linkedAppID = nil
    }
}

/// Adding an app that isn't in the built-in catalog.
struct AddCustomAppSheet: View {
    @ObservedObject var store: LinkedAppsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var scheme = ""
    @State private var testResult: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("App name") {
                    TextField("e.g. Obsidian", text: $name)
                }

                Section {
                    TextField("obsidian://", text: $scheme)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.body.monospaced())
                } header: {
                    Text("URL scheme")
                } footer: {
                    Text("Usually the app's name followed by ://. Searching \"[app name] URL scheme\" normally turns it up.")
                }

                Section {
                    Button("Test this link") {
                        var candidate = scheme.trimmingCharacters(in: .whitespaces)
                        if !candidate.contains("://") { candidate += "://" }
                        testResult = AppLauncher.open(candidate)
                            ? nil
                            : "Nothing opened — the scheme is probably wrong."
                    }
                    .disabled(scheme.trimmingCharacters(in: .whitespaces).isEmpty)

                    if let testResult {
                        Text(testResult)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } footer: {
                    Text("Custom apps can't be checked for installation the way built-in ones can, so they always appear in the list. Testing first is the only way to be sure.")
                }
            }
            .navigationTitle("Add a custom app")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.addCustomApp(name: name, scheme: scheme)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty
                              || scheme.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

/// Picking which app a goal should open. Shows only installed apps,
/// plus any custom ones you've added.
struct AppPickerSheet: View {
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    var onPick: (String, String, String?) -> Void   // scheme, name, catalog id

    @Environment(\.dismiss) private var dismiss
    @State private var categories: [LinkableAppCategory] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button("No linked app", role: .destructive) {
                        onPick("", "", nil)
                        dismiss()
                    }
                }

                ForEach(categories) { category in
                    let available = category.apps.filter { AppLauncher.isInstalled($0.scheme) }
                    if !available.isEmpty {
                        Section(category.name) {
                            ForEach(available) { app in
                                Button {
                                    onPick(app.scheme, app.name, app.id)
                                    dismiss()
                                } label: {
                                    HStack(spacing: 11) {
                                        Image(systemName: app.sfSymbol)
                                            .foregroundStyle(LinkedAppsCatalog.color(for: app.id))
                                            .frame(width: 22)
                                        Text(app.name).foregroundStyle(.primary)
                                        Spacer()
                                    }
                                }
                            }
                        }
                    }
                }

                if !linkedAppsStore.customApps.isEmpty {
                    Section("Custom") {
                        ForEach(linkedAppsStore.customApps) { app in
                            Button {
                                onPick(app.scheme, app.name, nil)
                                dismiss()
                            } label: {
                                HStack(spacing: 11) {
                                    Image(systemName: "app.dashed")
                                        .foregroundStyle(.secondary)
                                        .frame(width: 22)
                                    Text(app.name).foregroundStyle(.primary)
                                    Spacer()
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Link an app")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { categories = LinkedAppsCatalog.load() }
        }
    }
}

/// Shown when you come back to Vectis after opening a linked app.
///
/// Deliberately asks rather than assuming. The app knows how long you
/// were gone, not what you did — so it shows the time and lets you
/// decide whether it counted.
struct ReturnCheckInSheet: View {
    let launch: PendingLaunch
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var linkedAppsStore: LinkedAppsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss

    private var goal: Goal? {
        goalsStore.goals.first { $0.id == launch.goalID }
    }

    var body: some View {
        VStack(spacing: 16) {
            Text("Welcome back")
                .font(.title3.weight(.bold))

            VStack(spacing: 4) {
                Text("You spent \(linkedAppsStore.minutesAway(launch)) minutes in \(launch.appName).")
                    .font(.subheadline)
                if let goal {
                    Text("Did that count toward \(goal.title.lowercased())?")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                Button {
                    goalsStore.setToday(launch.goalID, done: true)
                    linkedAppsStore.clearPendingLaunch()
                    dismiss()
                } label: {
                    Text("Yes, done").frame(maxWidth: .infinity)
                }
                .buttonStyle(VectisButtonStyle(kind: .primary, accent: appearanceStore.primaryColor))

                Button {
                    // Leaves it unresolved — it stays "in progress" and
                    // you can pick it back up later today.
                    linkedAppsStore.clearPendingLaunch()
                    dismiss()
                } label: {
                    Text("Not yet").frame(maxWidth: .infinity)
                }
                .buttonStyle(VectisButtonStyle(kind: .secondary, accent: appearanceStore.primaryColor))

                Button {
                    linkedAppsStore.clearPendingLaunch()
                    dismiss()
                } label: {
                    Text("Didn't count").font(.caption).frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
        .padding(24)
        .presentationDetents([.height(280)])
    }
}

