import Foundation
import Combine

/// A goal whose linked app you opened but haven't confirmed yet.
///
/// This is the heart of the "in progress, confirm on return" flow: we
/// deliberately don't mark a goal done just because you tapped the
/// button, since tapping "Books" and immediately switching to something
/// else shouldn't count as reading. Instead we record when you left,
/// and ask when you come back.
struct PendingLaunch: Codable {
    var goalID: UUID
    var appName: String
    var startedAt: Date
}

class LinkedAppsStore: ObservableObject {
    @Published var customApps: [CustomApp] = []
    @Published var pendingLaunch: PendingLaunch?

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let saved = PersistenceManager.load([CustomApp].self, from: PersistenceManager.Filename.customApps) {
            customApps = saved
        }
        // A pending launch survives the app being killed — if you open
        // Books, get distracted, and Vectis gets closed in the
        // background, the check-in still happens next time you open it.
        pendingLaunch = PersistenceManager.load(PendingLaunch.self, from: PersistenceManager.Filename.pendingLaunch)

        $customApps
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.customApps) }
            .store(in: &cancellables)
    }

    func addCustomApp(name: String, scheme: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        var trimmedScheme = scheme.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty, !trimmedScheme.isEmpty else { return }
        // Be forgiving about the :// — easy to forget when typing.
        if !trimmedScheme.contains("://") {
            trimmedScheme += "://"
        }
        customApps.append(CustomApp(name: trimmedName, scheme: trimmedScheme))
    }

    func deleteCustomApp(_ id: UUID) {
        customApps.removeAll { $0.id == id }
    }

    // MARK: - Launch tracking

    func beginLaunch(goalID: UUID, appName: String) {
        let launch = PendingLaunch(goalID: goalID, appName: appName, startedAt: Date())
        pendingLaunch = launch
        PersistenceManager.save(launch, to: PersistenceManager.Filename.pendingLaunch)
    }

    func clearPendingLaunch() {
        pendingLaunch = nil
        PersistenceManager.delete(PersistenceManager.Filename.pendingLaunch)
    }

    /// How long you were away, in minutes — shown in the check-in so
    /// the question answers itself. Four minutes in Books is its own
    /// argument about whether you read for thirty.
    func minutesAway(_ launch: PendingLaunch) -> Int {
        max(Int(Date().timeIntervalSince(launch.startedAt) / 60), 0)
    }
}
