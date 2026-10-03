import SwiftUI

/// Destinations that live in the sidebar rather than the bottom tab bar
/// — things you visit occasionally rather than several times a day.
enum SidebarDestination: Identifiable {
    case people
    case linkedApps
    case settings

    var id: String {
        switch self {
        case .people: return "people"
        case .linkedApps: return "linkedApps"
        case .settings: return "settings"
        }
    }

    var title: String {
        switch self {
        case .people: return "People"
        case .linkedApps: return "Linked apps"
        case .settings: return "Settings"
        }
    }

    var subtitle: String {
        switch self {
        case .people: return "Contacts, birthdays, quick actions"
        case .linkedApps: return "Apps you can open from goals"
        case .settings: return "Appearance, categories, preferences"
        }
    }

    var icon: String {
        switch self {
        case .people: return "person.2"
        case .linkedApps: return "square.grid.2x2"
        case .settings: return "gearshape"
        }
    }
}

/// The slide-in menu, opened from the icon at the top right. Holds
/// destinations that don't warrant a permanent tab, plus Settings —
/// which sits visually separated at the bottom, since it's
/// configuration rather than a place you go.
struct SidebarMenu: View {
    @Binding var isOpen: Bool
    @ObservedObject var appearanceStore: AppearanceStore
    var onSelect: (SidebarDestination) -> Void

    private let destinations: [SidebarDestination] = [.people, .linkedApps]

    var body: some View {
        ZStack(alignment: .trailing) {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture { withAnimation(.easeOut(duration: 0.2)) { isOpen = false } }

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { isOpen = false }
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Close menu")
                    Spacer()
                    Text(AppBrand.wordmark)
                        .font(.system(.title3, design: .serif).italic().weight(.medium))
                        .foregroundStyle(appearanceStore.primaryColor)
                }
                .padding()

                ForEach(destinations) { destination in
                    Button {
                        select(destination)
                    } label: {
                        row(destination, tinted: true)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Divider()
                Button {
                    select(.settings)
                } label: {
                    row(.settings, tinted: false)
                }
                .buttonStyle(.plain)
                    .padding(.bottom, 8)
            }
            .frame(width: UIScreen.main.bounds.width * 0.76)
            .frame(maxHeight: .infinity)
            .background(Color(.systemBackground))
            .transition(.move(edge: .trailing))
        }
    }

    private func select(_ destination: SidebarDestination) {
        withAnimation(.easeOut(duration: 0.2)) { isOpen = false }
        onSelect(destination)
    }

    private func row(_ destination: SidebarDestination, tinted: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: destination.icon)
                .font(.title3)
                .foregroundStyle(tinted ? appearanceStore.primaryColor : Color.secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(destination.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                Text(destination.subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Stand-in for pages that are designed but not yet built, so the
/// sidebar works end to end without dead links.
struct ComingSoonView: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "hammer")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
