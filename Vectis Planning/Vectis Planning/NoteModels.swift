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

