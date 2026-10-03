import Foundation

/// The three kinds of notes you can create. Kept as its own type rather
/// than inferred from content, since a note's kind decides which editor
/// UI it gets — a Jot never shows a title field, for instance.
enum NoteType: String, Codable, CaseIterable, Identifiable {
    case jot
    case list
    case classic

    var id: String { rawValue }
}

/// One line inside a List note.
struct ChecklistItem: Identifiable, Codable {
    var id: UUID = UUID()
    var text: String = ""
    var done: Bool = false
}

/// A named collection of notes. Notebooks hold notes of any type and
/// can be linked to a goal, same as an individual note can.
struct Notebook: Identifiable, Codable {
    var id: UUID = UUID()
    var title: String
    var linkedGoalID: UUID? = nil
    var createdDate: Date = Date()
}

/// A single note. Only the fields relevant to its `type` actually get
/// used — a Jot only ever touches `jotText`, a List only ever touches
/// `checklistItems`, and so on. Keeping them all on one struct (rather
/// than three separate note types) keeps the store and the list view
/// simple, at the small cost of a few always-empty fields per note.
struct Note: Identifiable, Codable {
    var id: UUID = UUID()
    var type: NoteType
    var title: String = ""              // unused for .jot
    var jotText: String = ""            // only used by .jot
    var richTextData: Data? = nil       // only used by .classic — real
                                         // formatted text, saved as RTF
                                         // (see RichTextEditor.swift)
    var checklistItems: [ChecklistItem] = []   // only used by .list

    // Optional link to any goal — short-term or long-term. `nil` means
    // this note isn't tied to anything, which is the default and the
    // common case until you decide you want that connection.
    var linkedGoalID: UUID? = nil

    // Which notebook this note lives in, if any. `nil` means it sits
    // loose in its type's section rather than inside a collection.
    var notebookID: UUID? = nil

    var updatedDate: Date = Date()
}

// MARK: - Hand-written Codable
//
// Written out by hand so a missing field falls back to a default instead
// of failing the whole file (see the suite's engineering rules). Kept in
// extensions so Swift still generates the memberwise initialiser.

extension ChecklistItem {
    enum CodingKeys: String, CodingKey {
        case id, text, done
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        done = try c.decodeIfPresent(Bool.self, forKey: .done) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(text, forKey: .text)
        try c.encode(done, forKey: .done)
    }
}

extension Notebook {
    enum CodingKeys: String, CodingKey {
        case id, title, linkedGoalID, createdDate
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        linkedGoalID = try c.decodeIfPresent(UUID.self, forKey: .linkedGoalID)
        createdDate = try c.decodeIfPresent(Date.self, forKey: .createdDate) ?? Date()
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(linkedGoalID, forKey: .linkedGoalID)
        try c.encode(createdDate, forKey: .createdDate)
    }
}

extension Note {
    enum CodingKeys: String, CodingKey {
        case id, type, title, jotText, richTextData, checklistItems, linkedGoalID, notebookID, updatedDate
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        type = (try? c.decodeIfPresent(NoteType.self, forKey: .type)) ?? .classic
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        jotText = try c.decodeIfPresent(String.self, forKey: .jotText) ?? ""
        richTextData = try c.decodeIfPresent(Data.self, forKey: .richTextData)
        checklistItems = try c.decodeIfPresent([ChecklistItem].self, forKey: .checklistItems) ?? []
        linkedGoalID = try c.decodeIfPresent(UUID.self, forKey: .linkedGoalID)
        notebookID = try c.decodeIfPresent(UUID.self, forKey: .notebookID)
        updatedDate = try c.decodeIfPresent(Date.self, forKey: .updatedDate) ?? Date()
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(title, forKey: .title)
        try c.encode(jotText, forKey: .jotText)
        try c.encodeIfPresent(richTextData, forKey: .richTextData)
        try c.encode(checklistItems, forKey: .checklistItems)
        try c.encodeIfPresent(linkedGoalID, forKey: .linkedGoalID)
        try c.encodeIfPresent(notebookID, forKey: .notebookID)
        try c.encode(updatedDate, forKey: .updatedDate)
    }
}
