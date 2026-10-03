import SwiftUI

/// Settings: plan and review, appearance, your categories (name, color,
/// add/remove) and which hours show on the Daily calendar. Each edits
/// its store directly — the exact same data the rest of the app reads —
/// so a change made here shows up everywhere else immediately.
struct SettingsView: View {
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var appearanceStore: AppearanceStore
    @ObservedObject var planReviewStore: PlanReviewStore

    @State private var categoryPendingDelete: CalendarCategory?
    @Environment(\.dismiss) private var dismiss

    private var accent: Color { appearanceStore.primaryColor }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    planReviewBox
                    displayModeBox
                    colorSchemeBox
                    categoriesBox
                    hoursBox
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Delete \(categoryPendingDelete?.name ?? "category")?",
                isPresented: Binding(
                    get: { categoryPendingDelete != nil },
                    set: { if !$0 { categoryPendingDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete category", role: .destructive) {
                    if let id = categoryPendingDelete?.id {
                        calendarStore.categories.removeAll { $0.id == id }
                    }
                    categoryPendingDelete = nil
                }
                Button("Cancel", role: .cancel) { categoryPendingDelete = nil }
            } message: {
                Text("Events using it stay where they are, just without its color until you pick a new one.")
            }
        }
    }

    // MARK: - Boxes

    private var planReviewBox: some View {
        EditorBox(title: "Plan and review", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                Toggle("Plan and review", isOn: $planReviewStore.isEnabled)

                if planReviewStore.isEnabled {
                    EditorTimeField(label: "Evening review", selection: eveningReviewBinding)
                    Toggle("Review time estimates", isOn: $planReviewStore.reviewTimeEstimates)
                    Toggle("Rehearse your plans", isOn: $planReviewStore.rehearsePlans)
                    Toggle("Flag repeated misses", isOn: $planReviewStore.flagRepeatedMisses)
                    Toggle("Fresh start prompts", isOn: $planReviewStore.freshStartPrompts)
                }

                note(planReviewStore.isEnabled
                    ? "A quiet evening review shows up on Home once the time above passes, until you've answered it for the day."
                    : "Off by default. Turning it on adds a short evening review to Home — what got done, and an optional line of reflection.")
            }
            .font(.subheadline)
        }
    }

    private var eveningReviewBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.startOfDay(for: Date())
                    .addingTimeInterval(TimeInterval(planReviewStore.eveningReviewMinutes * 60))
            },
            set: { newValue in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                planReviewStore.eveningReviewMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
            }
        )
    }

    private var displayModeBox: some View {
        EditorBox(title: "Display mode", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                UnderlineSelector(
                    options: ColorSchemeMode.allCases.map { (value: $0, label: $0.label) },
                    selection: $appearanceStore.mode,
                    accent: accent,
                    verticalPadding: 8
                )
                note("System follows your device's own light/dark schedule automatically.")
            }
        }
    }

    private var colorSchemeBox: some View {
        EditorBox(title: "Color scheme", accent: accent) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(PalettePreset.all) { preset in
                    PresetRow(
                        preset: preset,
                        isSelected: !appearanceStore.isCustom && appearanceStore.selectedPresetID == preset.id,
                        accent: accent
                    ) {
                        appearanceStore.selectPreset(preset.id)
                    }
                }

                Button {
                    appearanceStore.selectCustom()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "paintpalette")
                            .foregroundStyle(.secondary)
                            .frame(width: 18 * 3 + 8, alignment: .leading)
                        Text("Custom")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                        Spacer()
                        if appearanceStore.isCustom {
                            Image(systemName: "checkmark")
                                .foregroundStyle(accent)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(appearanceStore.isCustom ? .isSelected : [])

                if appearanceStore.isCustom {
                    customColorPicker("Primary", hex: $appearanceStore.customPrimaryHex)
                    customColorPicker("Secondary", hex: $appearanceStore.customSecondaryHex)
                    customColorPicker("Tertiary", hex: $appearanceStore.customTertiaryHex)
                }

                note("Warning colors (overdue, unconfirmed) always stay the same regardless of scheme, for clarity.")
            }
        }
    }

    private func customColorPicker(_ label: String, hex: Binding<String>) -> some View {
        ColorPicker(
            label,
            selection: Binding(
                get: { Color(hex: hex.wrappedValue) },
                set: { hex.wrappedValue = $0.hexString }
            )
        )
        .font(.subheadline)
    }

    private var categoriesBox: some View {
        EditorBox(title: "Categories", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                // `$calendarStore.categories` gives a Binding to each
                // category in place, so typing a name or picking a color
                // writes straight back into the store — no save step.
                ForEach($calendarStore.categories) { $category in
                    HStack(spacing: 12) {
                        ColorPicker(
                            "",
                            selection: Binding(
                                get: { Color(hex: category.colorHex) },
                                set: { category.colorHex = $0.hexString }
                            )
                        )
                        .labelsHidden()

                        TextField("Category name", text: $category.name)
                            .font(.subheadline)

                        // The last category can't go: events need one,
                        // and the event editor can't save without it.
                        if calendarStore.categories.count > 1 {
                            Button {
                                categoryPendingDelete = category
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Delete \(category.name)")
                        }
                    }
                }

                Button {
                    calendarStore.categories.append(CalendarCategory(name: "New category", colorHex: "#4A7FE8"))
                } label: {
                    Label("Add category", systemImage: "plus")
                }
                .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accent))

                note("Used across your calendars and goals.")
            }
        }
    }

    private var hoursBox: some View {
        EditorBox(title: "Daily calendar hours", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                Picker("From", selection: startHourBinding) {
                    ForEach(0..<24, id: \.self) { hour in
                        Text(hourLabel(hour)).tag(hour)
                    }
                }
                // Only hours after the start: an end before the start
                // would give the Daily grid a negative number of rows,
                // which crashes it.
                Picker("To", selection: $calendarStore.dailyCalendarEndHour) {
                    ForEach((calendarStore.dailyCalendarStartHour + 1)...24, id: \.self) { hour in
                        Text(hourLabel(hour)).tag(hour)
                    }
                }
                note("Sets which hours show on your Daily calendar view.")
            }
            .font(.subheadline)
            .tint(accent)
        }
    }

    /// Moving the start past the end pushes the end along with it.
    private var startHourBinding: Binding<Int> {
        Binding(
            get: { calendarStore.dailyCalendarStartHour },
            set: { newStart in
                calendarStore.dailyCalendarStartHour = newStart
                if calendarStore.dailyCalendarEndHour <= newStart {
                    calendarStore.dailyCalendarEndHour = newStart + 1
                }
            }
        )
    }

    // MARK: - Helpers

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// In the phone's own 12- or 24-hour style.
    private func hourLabel(_ hour: Int) -> String {
        let date = Calendar.current.startOfDay(for: Date()).addingTimeInterval(TimeInterval(hour * 3600))
        let label = date.formatted(date: .omitted, time: .shortened)
        return hour == 24 ? "\(label) (midnight)" : label
    }
}

/// One palette preset: three colour dots, its name and the idea behind it.
private struct PresetRow: View {
    let preset: PalettePreset
    let isSelected: Bool
    let accent: Color
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: preset.primaryHex)).frame(width: 18, height: 18)
                    Circle().fill(Color(hex: preset.secondaryHex)).frame(width: 18, height: 18)
                    Circle().fill(Color(hex: preset.tertiaryHex)).frame(width: 18, height: 18)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(preset.name)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Text(preset.theory)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(accent)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
