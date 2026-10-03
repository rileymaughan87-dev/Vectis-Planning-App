import Foundation
import Combine
import Contacts

/// A person you've added to Vectis.
///
/// Deliberately stores only a reference to the system contact plus a
/// cached name — not their full details. The address book stays the
/// single source of truth, so a number you update in Contacts is
/// immediately right here too, with no stale copy to go out of sync.
struct Person: Identifiable, Codable {
    var id: UUID = UUID()

    /// The system contact's identifier, used to look up live details.
    var contactIdentifier: String

    /// Cached so the list still shows something sensible if contact
    /// access is denied or the contact was deleted from the phone.
    var cachedName: String

    /// Whether this person's birthday should appear on the calendar.
    var birthdayOnCalendar: Bool = false
}

/// The live details for a person, read fresh from the address book
/// rather than stored. Not Codable on purpose — this is never saved.
struct PersonDetails {
    var name: String
    var phoneNumbers: [(label: String, number: String)]
    var birthday: DateComponents?

    var primaryNumber: String? { phoneNumbers.first?.number }
    var hasMultipleNumbers: Bool { phoneNumbers.count > 1 }

    var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    var birthdayText: String? {
        guard let birthday, let month = birthday.month, let day = birthday.day else { return nil }
        var components = DateComponents()
        components.month = month
        components.day = day
        components.year = 2000   // arbitrary — only month/day are shown
        guard let date = Calendar.current.date(from: components) else { return nil }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}

class PeopleStore: ObservableObject {
    @Published var people: [Person] = []

    /// Set once someone has answered the "add all birthdays?" prompt,
    /// so it only ever asks the first time.
    @Published var hasAskedAboutBirthdays = false
    @Published var addAllBirthdaysAutomatically = false

    private var cancellables = Set<AnyCancellable>()
    private let contactStore = CNContactStore()

    init() {
        if let saved = PersistenceManager.load([Person].self, from: PersistenceManager.Filename.people) {
            people = saved
        }
        if let prefs = PersistenceManager.load(BirthdayPrefs.self, from: PersistenceManager.Filename.birthdayPrefs) {
            hasAskedAboutBirthdays = prefs.hasAsked
            addAllBirthdaysAutomatically = prefs.addAll
        }

        $people
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.people) }
            .store(in: &cancellables)

        Publishers.CombineLatest($hasAskedAboutBirthdays, $addAllBirthdaysAutomatically)
            .dropFirst()
            .sink { asked, all in
                PersistenceManager.save(BirthdayPrefs(hasAsked: asked, addAll: all), to: PersistenceManager.Filename.birthdayPrefs)
            }
            .store(in: &cancellables)
    }

    struct BirthdayPrefs: Codable {
        var hasAsked: Bool
        var addAll: Bool
    }

    // MARK: - Reading from Contacts

    /// Looks up a person's live details. Returns nil if access was
    /// denied or the contact no longer exists.
    func details(for person: Person) -> PersonDetails? {
        let keys: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactBirthdayKey as CNKeyDescriptor
        ]
        guard let contact = try? contactStore.unifiedContact(withIdentifier: person.contactIdentifier, keysToFetch: keys) else {
            return nil
        }
        return makeDetails(from: contact)
    }

    func makeDetails(from contact: CNContact) -> PersonDetails {
        let name = [contact.givenName, contact.familyName]
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        let numbers = contact.phoneNumbers.map { entry -> (String, String) in
            let label = entry.label.map { CNLabeledValue<NSString>.localizedString(forLabel: $0) } ?? "Phone"
            return (label, entry.value.stringValue)
        }

        return PersonDetails(
            name: name.isEmpty ? "No name" : name,
            phoneNumbers: numbers,
            birthday: contact.birthday
        )
    }

    // MARK: - Writing

    func addPerson(from contact: CNContact) {
        // Don't add the same contact twice.
        guard !people.contains(where: { $0.contactIdentifier == contact.identifier }) else { return }

        let details = makeDetails(from: contact)
        var person = Person(contactIdentifier: contact.identifier, cachedName: details.name)

        // If they've already said "add all birthdays", honour that
        // rather than asking again for every new person.
        if addAllBirthdaysAutomatically && details.birthday != nil {
            person.birthdayOnCalendar = true
        }
        people.append(person)
    }

    func setBirthdayOnCalendar(_ personID: UUID, enabled: Bool) {
        guard let index = people.firstIndex(where: { $0.id == personID }) else { return }
        people[index].birthdayOnCalendar = enabled
    }

    /// Turns the "add all" preference on and applies it to everyone who
    /// already has a birthday saved.
    func enableAllBirthdays() {
        addAllBirthdaysAutomatically = true
        hasAskedAboutBirthdays = true
        for index in people.indices where details(for: people[index])?.birthday != nil {
            people[index].birthdayOnCalendar = true
        }
    }

    func delete(_ personID: UUID) {
        people.removeAll { $0.id == personID }
    }
}

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension Person {
    enum CodingKeys: String, CodingKey {
        case id, contactIdentifier, cachedName, birthdayOnCalendar
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        contactIdentifier = try c.decodeIfPresent(String.self, forKey: .contactIdentifier) ?? ""
        cachedName = try c.decodeIfPresent(String.self, forKey: .cachedName) ?? ""
        birthdayOnCalendar = try c.decodeIfPresent(Bool.self, forKey: .birthdayOnCalendar) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(contactIdentifier, forKey: .contactIdentifier)
        try c.encode(cachedName, forKey: .cachedName)
        try c.encode(birthdayOnCalendar, forKey: .birthdayOnCalendar)
    }
}

extension PeopleStore.BirthdayPrefs {
    enum CodingKeys: String, CodingKey {
        case hasAsked, addAll
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hasAsked = try c.decodeIfPresent(Bool.self, forKey: .hasAsked) ?? false
        addAll = try c.decodeIfPresent(Bool.self, forKey: .addAll) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(hasAsked, forKey: .hasAsked)
        try c.encode(addAll, forKey: .addAll)
    }
}
