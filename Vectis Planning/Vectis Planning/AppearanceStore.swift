import SwiftUI
import Combine

enum ColorSchemeMode: String, CaseIterable, Identifiable {
    case light, dark, system
    var id: String { rawValue }

    var label: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}

/// One preset color scheme — a primary/secondary/tertiary trio chosen
/// using an actual color theory pairing, plus a short note on what that
/// pairing is, shown right in the picker so the choice isn't just
/// "which one looks nice" but "which relationship do you want."
struct PalettePreset: Identifiable {
    let id: String
    let name: String
    let theory: String
    let primaryHex: String
    let secondaryHex: String
    let tertiaryHex: String

    static let all: [PalettePreset] = [
        PalettePreset(id: "tealCoral", name: "Teal and coral", theory: "Complementary — blue-green paired with its warm opposite", primaryHex: "1C8C82", secondaryHex: "D2574A", tertiaryHex: "C9922E"),
        PalettePreset(id: "indigoAmber", name: "Indigo and amber", theory: "Classic professional pairing, cool and warm balance", primaryHex: "3F51B5", secondaryHex: "F2A93B", tertiaryHex: "6B7FD7"),
        PalettePreset(id: "forestClay", name: "Forest and clay", theory: "Analogous earth tones, calm and grounded", primaryHex: "3F6B4E", secondaryHex: "C97B4A", tertiaryHex: "8FA679"),
        PalettePreset(id: "plumSage", name: "Plum and sage", theory: "Muted complementary, sophisticated and quiet", primaryHex: "6B4C7A", secondaryHex: "7C9473", tertiaryHex: "C99A6B"),
        PalettePreset(id: "monoTeal", name: "Monochrome teal", theory: "Single hue at three depths — minimal, can't clash", primaryHex: "1C8C82", secondaryHex: "5FADA5", tertiaryHex: "0F5F58")
    ]
}

/// Holds the user's appearance preferences and hands out the actual
/// Colors the rest of the app should use for its primary/secondary/
/// tertiary accents. Same shared-store pattern as GoalsStore or
/// CalendarStore — one source of truth, so every screen that reads
/// `primaryColor` stays in sync automatically when this changes.
///
/// Note: warning-type colors (overdue red, unconfirmed amber) are
/// intentionally NOT part of this store — they're hardcoded where
/// they're used, on purpose, so they always mean the same thing
/// regardless of which color scheme is active.
class AppearanceStore: ObservableObject {
    @Published var mode: ColorSchemeMode = .system
    @Published var selectedPresetID: String = "tealCoral"
    @Published var isCustom: Bool = false

    @Published var customPrimaryHex: String = "1C8C82"
    @Published var customSecondaryHex: String = "D2574A"
    @Published var customTertiaryHex: String = "C9922E"

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let saved = PersistenceManager.load(AppearanceSettings.self, from: PersistenceManager.Filename.appearance) {
            mode = ColorSchemeMode(rawValue: saved.mode) ?? .system
            selectedPresetID = saved.selectedPresetID
            isCustom = saved.isCustom
            customPrimaryHex = saved.customPrimaryHex
            customSecondaryHex = saved.customSecondaryHex
            customTertiaryHex = saved.customTertiaryHex
        }

        // `objectWillChange` fires for any @Published property here, so
        // one subscription covers all six rather than needing a separate
        // one each. The tiny delay lets the property finish updating
        // before we snapshot it — otherwise we'd save the old value.
        objectWillChange
            .debounce(for: .milliseconds(50), scheduler: RunLoop.main)
            .sink { [weak self] in
                guard let self else { return }
                PersistenceManager.save(
                    AppearanceSettings(
                        mode: self.mode.rawValue,
                        selectedPresetID: self.selectedPresetID,
                        isCustom: self.isCustom,
                        customPrimaryHex: self.customPrimaryHex,
                        customSecondaryHex: self.customSecondaryHex,
                        customTertiaryHex: self.customTertiaryHex
                    ),
                    to: PersistenceManager.Filename.appearance
                )
            }
            .store(in: &cancellables)
    }

    /// What to pass to `.preferredColorScheme()` at the app root.
    /// `nil` specifically means "follow the system," which is what lets
    /// someone have it flip automatically between their device's own
    /// light/dark schedule.
    var preferredColorScheme: ColorScheme? {
        switch mode {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }

    private var activePreset: PalettePreset? {
        PalettePreset.all.first { $0.id == selectedPresetID }
    }

    var primaryColor: Color {
        Color(hex: primaryHex)
    }
    var secondaryColor: Color {
        Color(hex: secondaryHex)
    }
    var tertiaryColor: Color {
        Color(hex: tertiaryHex)
    }

    // Hex versions, for the places that pass colors around as strings
    // (like LongTermDayItem, which stores a hex to stay Codable-friendly).
    var primaryHex: String {
        isCustom ? customPrimaryHex : (activePreset?.primaryHex ?? "1C8C82")
    }
    var secondaryHex: String {
        isCustom ? customSecondaryHex : (activePreset?.secondaryHex ?? "D2574A")
    }
    var tertiaryHex: String {
        isCustom ? customTertiaryHex : (activePreset?.tertiaryHex ?? "C9922E")
    }

    func selectPreset(_ id: String) {
        selectedPresetID = id
        isCustom = false
    }

    func selectCustom() {
        isCustom = true
    }
}

