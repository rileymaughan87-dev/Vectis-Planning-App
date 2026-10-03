import SwiftUI
import UIKit

/// Picking which person a goal or event is tied to. Only offers people
/// already added to the People page, since that's what holds the
/// contact reference.
struct PersonPickerSheet: View {
    @ObservedObject var peopleStore: PeopleStore
    @Binding var selection: UUID?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        selection = nil
                        dismiss()
                    } label: {
                        HStack {
                            Text("No one").foregroundStyle(.primary)
                            Spacer()
                            if selection == nil {
                                Image(systemName: "checkmark").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if peopleStore.people.isEmpty {
                    Section {
                        Text("No one added yet. Add people from the sidebar first.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        ForEach(peopleStore.people) { person in
                            Button {
                                selection = person.id
                                dismiss()
                            } label: {
                                HStack {
                                    Text(peopleStore.details(for: person)?.name ?? person.cachedName)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if selection == person.id {
                                        Image(systemName: "checkmark").foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Link a person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// The call / message / WhatsApp row shown wherever a person is linked.
///
/// Pulled out so goals, events and the People page all behave
/// identically — one place to fix if a link format ever changes.
struct ContactActionsRow: View {
    let personID: UUID
    @ObservedObject var peopleStore: PeopleStore
    var accentColor: Color
    var compact: Bool = false

    @State private var showingNumberChoice = false
    @State private var pendingURLTemplate: String?

    private var person: Person? {
        peopleStore.people.first { $0.id == personID }
    }

    private var details: PersonDetails? {
        person.flatMap { peopleStore.details(for: $0) }
    }

    var body: some View {
        if let details, !details.phoneNumbers.isEmpty {
            HStack(spacing: compact ? 14 : 8) {
                if !compact {
                    Text(details.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                action("phone", "tel://%@")
                action("message", "sms://%@")
                action("bubble.left.and.bubble.right", "https://wa.me/%@")
            }
            .sheet(isPresented: $showingNumberChoice) {
                numberChoice(details)
            }
        }
    }

    private func accessibilityName(for symbol: String) -> String {
        let name = details?.name ?? ""
        switch symbol {
        case "phone": return "Call \(name)"
        case "message": return "Message \(name)"
        default: return "WhatsApp \(name)"
        }
    }

    private func action(_ symbol: String, _ template: String) -> some View {
        Button {
            guard let details else { return }
            if details.hasMultipleNumbers {
                pendingURLTemplate = template
                showingNumberChoice = true
            } else if let number = details.primaryNumber {
                open(template, number: number)
            }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: compact ? 15 : 16))
                .foregroundStyle(accentColor)
        }
        .accessibilityLabel(accessibilityName(for: symbol))
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func numberChoice(_ details: PersonDetails) -> some View {
        NavigationStack {
            List(details.phoneNumbers, id: \.number) { entry in
                Button {
                    if let template = pendingURLTemplate {
                        open(template, number: entry.number)
                    }
                    showingNumberChoice = false
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
                    Button("Cancel") { showingNumberChoice = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func open(_ template: String, number: String) {
        var cleaned = number.filter { $0.isNumber || $0 == "+" }
        // wa.me links want no leading +, unlike tel: and sms:
        if template.contains("wa.me") {
            cleaned = cleaned.replacingOccurrences(of: "+", with: "")
        }
        if let url = URL(string: String(format: template, cleaned)) {
            UIApplication.shared.open(url)
        }
    }
}
