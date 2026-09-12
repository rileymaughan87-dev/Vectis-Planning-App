import SwiftUI
import ContactsUI
import Contacts

/// Wraps Apple's own contact picker so you choose individuals rather
/// than granting blanket address book access. Picking someone hands
/// back just that one contact.
struct ContactPicker: UIViewControllerRepresentable {
    var onPick: (CNContact) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    class Coordinator: NSObject, CNContactPickerDelegate {
        let onPick: (CNContact) -> Void
        init(onPick: @escaping (CNContact) -> Void) { self.onPick = onPick }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            onPick(contact)
        }
    }
}

/// Opens Apple's own contact editor, so changes save to the real
/// address book rather than Vectis holding its own copy.
struct ContactEditor: UIViewControllerRepresentable {
    let contactIdentifier: String

    func makeUIViewController(context: Context) -> UINavigationController {
        let store = CNContactStore()
        let keys = CNContactViewController.descriptorForRequiredKeys()
        let contact = (try? store.unifiedContact(withIdentifier: contactIdentifier, keysToFetch: [keys]))
            ?? CNContact()
        let controller = CNContactViewController(for: contact)
        controller.allowsEditing = true
        return UINavigationController(rootViewController: controller)
    }

    func updateUIViewController(_ uiViewController: UINavigationController, context: Context) {}
}

/// The People page from the sidebar: everyone you've added, with all
/// three contact methods reachable directly from the list.
struct PeopleView: View {
    @ObservedObject var store: PeopleStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var showingPicker = false
    @State private var selectedPerson: Person?
    @State private var birthdayPromptPerson: Person?
    @State private var numberChoicePerson: Person?
    @State private var pendingAction: ContactAction?

    enum ContactAction {
        case call, message, whatsapp
    }

    var body: some View {
        NavigationStack {
            List {
                if store.people.isEmpty {
                    Text("No one added yet. Tap + to pick someone from your contacts.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(store.people) { person in
                    personRow(person)
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.delete(store.people[index].id)
                    }
                }
            }
            .navigationTitle("People")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingPicker = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingPicker) {
                ContactPicker { contact in
                    store.addPerson(from: contact)
                    showingPicker = false
                }
            }
            .sheet(item: $selectedPerson) { person in
                PersonDetailView(person: person, store: store, appearanceStore: appearanceStore)
            }
            .sheet(item: $numberChoicePerson) { person in
                numberChoiceSheet(person)
            }
            .alert(
                "Add everyone's birthdays?",
                isPresented: Binding(
                    get: { birthdayPromptPerson != nil },
                    set: { if !$0 { birthdayPromptPerson = nil } }
                )
            ) {
                Button("Add all") {
                    store.enableAllBirthdays()
                    birthdayPromptPerson = nil
                }
                Button("Just this one") {
                    store.hasAskedAboutBirthdays = true
                    birthdayPromptPerson = nil
                }
            } message: {
                Text("Want Vectis to add birthdays to your calendar for everyone you add from now on? You can change this later in Settings.")
            }
        }
    }

    private func personRow(_ person: Person) -> some View {
        let details = store.details(for: person)

        return HStack(spacing: 12) {
            Button {
                selectedPerson = person
            } label: {
                HStack(spacing: 12) {
                    avatar(details?.initials ?? "?")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(details?.name ?? person.cachedName)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                        if let birthday = details?.birthdayText {
                            Label(birthday, systemImage: "gift")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        } else if details == nil {
                            Text("Contact unavailable")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .buttonStyle(.plain)

            Spacer()

            if let details, details.primaryNumber != nil {
                HStack(spacing: 14) {
                    actionButton(person, details, .call, "phone")
                    actionButton(person, details, .message, "message")
                    actionButton(person, details, .whatsapp, "bubble.left.and.bubble.right")
                }
            }
        }
    }

    private func actionButton(_ person: Person, _ details: PersonDetails, _ action: ContactAction, _ symbol: String) -> some View {
        Button {
            // Only asks which number when there's genuinely a choice —
            // invisible for the common single-number case.
            if details.hasMultipleNumbers {
                pendingAction = action
                numberChoicePerson = person
            } else if let number = details.primaryNumber {
                perform(action, number: number)
            }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 16))
                .foregroundStyle(appearanceStore.primaryColor)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func numberChoiceSheet(_ person: Person) -> some View {
        let details = store.details(for: person)
        NavigationStack {
            List(details?.phoneNumbers ?? [], id: \.number) { entry in
                Button {
                    if let action = pendingAction {
                        perform(action, number: entry.number)
                    }
                    numberChoicePerson = nil
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.label).font(.subheadline).foregroundStyle(.primary)
                        Text(entry.number).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Which number?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { numberChoicePerson = nil }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func perform(_ action: ContactAction, number: String) {
        // Strip spaces, brackets and dashes — tel: and WhatsApp links
        // want digits (and a leading +) only.
        let cleaned = number.filter { $0.isNumber || $0 == "+" }
        let urlString: String
        switch action {
        case .call: urlString = "tel://\(cleaned)"
        case .message: urlString = "sms://\(cleaned)"
        case .whatsapp: urlString = "https://wa.me/\(cleaned.replacingOccurrences(of: "+", with: ""))"
        }
        if let url = URL(string: urlString) {
            UIApplication.shared.open(url)
        }
    }

    private func avatar(_ initials: String) -> some View {
        Circle()
            .fill(appearanceStore.primaryColor)
            .frame(width: 38, height: 38)
            .overlay(
                Text(initials)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            )
    }
}

/// One person in full: their details, the three contact actions, their
/// birthday toggle, and a way into Apple's contact editor.
struct PersonDetailView: View {
    let person: Person
    @ObservedObject var store: PeopleStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var showingEditor = false
    @State private var showingBirthdayPrompt = false

    private var details: PersonDetails? { store.details(for: person) }

    private var currentPerson: Person {
        store.people.first { $0.id == person.id } ?? person
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 8) {
                        Circle()
                            .fill(appearanceStore.primaryColor)
                            .frame(width: 64, height: 64)
                            .overlay(
                                Text(details?.initials ?? "?")
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(.white)
                            )
                        Text(details?.name ?? person.cachedName)
                            .font(.headline)
                        if let number = details?.primaryNumber {
                            Text(number)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }

                if let details, let number = details.primaryNumber {
                    Section {
                        HStack(spacing: 8) {
                            bigAction("Call", "phone", "tel://\(clean(number))")
                            bigAction("Message", "message", "sms://\(clean(number))")
                            bigAction("WhatsApp", "bubble.left.and.bubble.right",
                                      "https://wa.me/\(clean(number).replacingOccurrences(of: "+", with: ""))")
                        }
                    }
                }

                Section {
                    if let birthdayText = details?.birthdayText {
                        Toggle(isOn: Binding(
                            get: { currentPerson.birthdayOnCalendar },
                            set: { enabled in
                                store.setBirthdayOnCalendar(person.id, enabled: enabled)
                                if enabled && !store.hasAskedAboutBirthdays {
                                    showingBirthdayPrompt = true
                                }
                            }
                        )) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Birthday")
                                Text(birthdayText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Birthday")
                            Text("Not saved in Contacts")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("Edit in Contacts", systemImage: "square.and.pencil")
                    }
                } footer: {
                    Text("Opens Apple's own contact editor, so changes save to your address book rather than only here.")
                }

                Section {
                    Button("Remove from Vectis", role: .destructive) {
                        store.delete(person.id)
                        dismiss()
                    }
                } footer: {
                    Text("Only removes them from Vectis. The contact itself stays on your phone.")
                }
            }
            .navigationTitle(details?.name ?? person.cachedName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(isPresented: $showingEditor) {
                ContactEditor(contactIdentifier: person.contactIdentifier)
            }
            .alert("Add everyone's birthdays?", isPresented: $showingBirthdayPrompt) {
                Button("Add all") { store.enableAllBirthdays() }
                Button("Just this one") { store.hasAskedAboutBirthdays = true }
            } message: {
                Text("Want Vectis to add birthdays to your calendar for everyone you add from now on? You can change this later in Settings.")
            }
        }
    }

    private func clean(_ number: String) -> String {
        number.filter { $0.isNumber || $0 == "+" }
    }

    private func bigAction(_ label: String, _ symbol: String, _ urlString: String) -> some View {
        Button {
            if let url = URL(string: urlString) { UIApplication.shared.open(url) }
        } label: {
            VStack(spacing: 5) {
                Image(systemName: symbol).font(.system(size: 18))
                Text(label).font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .foregroundStyle(appearanceStore.primaryColor)
        }
        .buttonStyle(.plain)
    }
}
