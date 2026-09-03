import SwiftUI

/// The five main sections in the bottom tab bar. Finance moved out to
/// the sidebar — it's an important feature but not a several-times-a-day
/// one, and keeping the bar to five keeps it readable.
enum AppTab: CaseIterable {
    case home, goals, daily, longTerm, notes

    var title: String {
        switch self {
        case .home: return "Home"
        case .goals: return "Goals"
        case .daily: return "Daily"
        case .longTerm: return "Long-Term"
        case .notes: return "Notes"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house"
        case .goals: return "target"
        case .daily: return "calendar"
        case .longTerm: return "calendar.badge.clock"
        case .notes: return "note.text"
        }
    }
}

struct ContentView: View {
    @StateObject private var goalsStore = GoalsStore()
    @StateObject private var calendarStore = CalendarStore()
    @StateObject private var notesStore = NotesStore()
    @StateObject private var financeStore = FinanceStore()
    @StateObject private var tasksStore = TasksStore()
    @StateObject private var appearanceStore = AppearanceStore()

    @State private var selectedTab: AppTab = .home
    @State private var sidebarOpen = false
    @State private var sidebarDestination: SidebarDestination?

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                topBar

                // All screens stay alive at once, hidden via opacity
                // rather than being torn down and rebuilt on every
                // switch — this keeps each tab's scroll position and
                // open state intact when you come back to it.
                ZStack {
                    HomeView(
                        calendarStore: calendarStore,
                        goalsStore: goalsStore,
                        tasksStore: tasksStore,
                        appearanceStore: appearanceStore
                    )
                    .opacity(selectedTab == .home ? 1 : 0)
                    .allowsHitTesting(selectedTab == .home)

                    GoalsView(store: goalsStore, appearanceStore: appearanceStore)
                        .opacity(selectedTab == .goals ? 1 : 0)
                        .allowsHitTesting(selectedTab == .goals)

                    DailyCalendarView(store: calendarStore, goalsStore: goalsStore, appearanceStore: appearanceStore)
                        .opacity(selectedTab == .daily ? 1 : 0)
                        .allowsHitTesting(selectedTab == .daily)

                    LongTermCalendarView(calendarStore: calendarStore, goalsStore: goalsStore, appearanceStore: appearanceStore)
                        .opacity(selectedTab == .longTerm ? 1 : 0)
                        .allowsHitTesting(selectedTab == .longTerm)

                    NotesView(store: notesStore, goalsStore: goalsStore, appearanceStore: appearanceStore)
                        .opacity(selectedTab == .notes ? 1 : 0)
                        .allowsHitTesting(selectedTab == .notes)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                customTabBar
            }

            if sidebarOpen {
                SidebarMenu(isOpen: $sidebarOpen, appearanceStore: appearanceStore) { destination in
                    sidebarDestination = destination
                }
                .zIndex(1)
            }
        }
        .tint(appearanceStore.primaryColor)
        .preferredColorScheme(appearanceStore.preferredColorScheme)
        .sheet(item: $sidebarDestination) { destination in
            sidebarSheet(for: destination)
        }
    }

    @ViewBuilder
    private func sidebarSheet(for destination: SidebarDestination) -> some View {
        switch destination {
        case .finance:
            FinanceView(store: financeStore)
        case .settings:
            SettingsView(calendarStore: calendarStore, appearanceStore: appearanceStore)
        case .people:
            ComingSoonView(
                title: "People",
                detail: "Contacts, birthdays and quick actions — designed, not yet built."
            )
        case .linkedApps:
            ComingSoonView(
                title: "Linked apps",
                detail: "Open apps straight from a goal or event — designed, not yet built."
            )
        }
    }

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("Vectis")
                    .font(.system(size: 14, design: .serif).italic().weight(.medium))
                    .foregroundStyle(appearanceStore.primaryColor)
                Spacer()
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { sidebarOpen = true }
                } label: {
                    Image(systemName: "line.3.horizontal")
                        .font(.title3)
                }
            }
            Text(selectedTab.title)
                .font(.largeTitle.weight(.bold))
        }
        .padding(.horizontal)
        .padding(.top, 10)
        .padding(.bottom, 14)
        .background(.bar)
    }

    private var customTabBar: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 19))
                        Text(tab.title)
                            .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                    }
                    .foregroundStyle(isSelected ? appearanceStore.primaryColor : Color.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                            .fill(isSelected ? appearanceStore.primaryColor.opacity(0.14) : Color.clear)
                    )
                    .padding(.horizontal, 4)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(Color(.secondarySystemBackground))
        .overlay(alignment: .top) { Divider() }
    }
}

#Preview {
    ContentView()
}

