import SwiftUI

/// Settings: your categories (name, color, add/remove) and which hours
/// show on the Daily calendar. Both edit CalendarStore directly — the
/// exact same data Daily and Long-Term already read from — so a change
/// made here shows up everywhere else immediately, with no extra
/// plumbing needed.
struct SettingsView: View {
    @ObservedObject var calendarStore: CalendarStore
    @ObservedObject var appearanceStore: AppearanceStore

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Display mode", selection: $appearanceStore.mode) {
                        ForEach(ColorSchemeMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Display mode")
                } footer: {
                    Text("System follows your device's own light/dark schedule automatically.")
                }

                Section {
                    ForEach(PalettePreset.all) { preset in
                        Button {
                            appearanceStore.selectPreset(preset.id)
                        } label: {
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
                                if !appearanceStore.isCustom && appearanceStore.selectedPresetID == preset.id {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(appearanceStore.primaryColor)
                                }
                            }
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
                                .foregroundStyle(.primary)
                            Spacer()
                            if appearanceStore.isCustom {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(appearanceStore.primaryColor)
                            }
                        }
                    }

                    if appearanceStore.isCustom {
                        ColorPicker(
                            "Primary",
                            selection: Binding(
                                get: { Color(hex: appearanceStore.customPrimaryHex) },
                                set: { appearanceStore.customPrimaryHex = $0.hexString }
                            )
                        )
                        ColorPicker(
                            "Secondary",
                            selection: Binding(
                                get: { Color(hex: appearanceStore.customSecondaryHex) },
                                set: { appearanceStore.customSecondaryHex = $0.hexString }
                            )
                        )
                        ColorPicker(
                            "Tertiary",
                            selection: Binding(
                                get: { Color(hex: appearanceStore.customTertiaryHex) },
                                set: { appearanceStore.customTertiaryHex = $0.hexString }
                            )
                        )
                    }
                } header: {
                    Text("Color scheme")
                } footer: {
                    Text("Warning colors (overdue, unconfirmed) always stay the same regardless of scheme, for clarity.")
                }

                Section {
                    // `ForEach($calendarStore.categories)` gives a Binding
                    // to each category in place, so typing in the name
                    // field or picking a color writes straight back into
                    // the store — no separate "save" step needed for edits.
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
                        }
                    }
                    .onDelete { offsets in
                        calendarStore.categories.remove(atOffsets: offsets)
                    }

                    Button {
                        calendarStore.categories.append(CalendarCategory(name: "New Category", colorHex: "#4A7FE8"))
                    } label: {
                        Label("Add category", systemImage: "plus")
                    }
                } header: {
                    Text("Categories")
                } footer: {
                    Text("Used across your calendars and goals. Deleting a category doesn't delete events already using it — they'll just show without a color until you pick a new one.")
                }

                Section {
                    Picker("From", selection: $calendarStore.dailyCalendarStartHour) {
                        ForEach(0..<24, id: \.self) { hour in
                            Text(hourLabel(hour)).tag(hour)
                        }
                    }
                    Picker("To", selection: $calendarStore.dailyCalendarEndHour) {
                        ForEach(1...24, id: \.self) { hour in
                            Text(hourLabel(hour)).tag(hour)
                        }
                    }
                } header: {
                    Text("Daily calendar hours")
                } footer: {
                    Text("Sets which hours show on your Daily calendar view.")
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func hourLabel(_ hour: Int) -> String {
        if hour == 0 { return "12 AM" }
        if hour == 24 { return "12 AM (midnight)" }
        let period = hour < 12 ? "AM" : "PM"
        var hour12 = hour % 12
        if hour12 == 0 { hour12 = 12 }
        return "\(hour12) \(period)"
    }
}

