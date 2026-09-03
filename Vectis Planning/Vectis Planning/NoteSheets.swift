import SwiftUI

/// Shown before creating a new note — pick Jot, List, or Note, and the
/// editor that opens next is tailored to that choice.
struct NoteTypePickerSheet: View {
    let onSelect: (NoteType) -> Void
    @Environment(\.dismiss) private var dismiss

    private let options: [(type: NoteType, icon: String, label: String, description: String)] = [
        (.jot, "bolt.fill", "Jot", "Quick, titleless, fast to capture"),
        (.list, "checklist", "List", "Starts with a checklist ready to go"),
        (.classic, "note.text", "Note", "A regular note with formatting")
    ]

    var body: some View {
        NavigationStack {
            List(options, id: \.type) { option in
                Button {
                    onSelect(option.type)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: option.icon)
                            .foregroundStyle(Color.accentColor)
                            .font(.title3)
                            .frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(option.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("New note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// Handles creating and editing all three note types in one sheet. Which
/// fields actually show up depends entirely on `type` — a Jot never
/// sees a title field or the goal-link section, for instance.
///
/// Classic notes use a real UIKit-backed rich text editor (see
/// RichTextEditor.swift) — select some text, tap Bold/Italic/Heading in
/// the toolbar, and it applies to just that selection, like any normal
/// text editor.
struct NoteEditorSheet: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore

    let originalNote: Note?
    let type: NoteType

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var jotText: String
    @State private var richText: NSAttributedString
    @State private var checklistItems: [ChecklistItem]
    @State private var linkedGoalID: UUID?
    @State private var notebookID: UUID?
    @StateObject private var richTextController = RichTextViewController()

    /// For creating a brand-new note of a given type. `inNotebook` files
    /// it into that notebook immediately, which is what happens when you
    /// create a note from inside a notebook rather than from the main list.
    init(store: NotesStore, goalsStore: GoalsStore, type: NoteType, inNotebook notebookID: UUID? = nil) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNote = nil
        self.type = type
        _title = State(initialValue: "")
        _jotText = State(initialValue: "")
        _richText = State(initialValue: NSAttributedString(string: ""))
        _checklistItems = State(initialValue: type == .list ? [ChecklistItem()] : [])
        _linkedGoalID = State(initialValue: nil)
        _notebookID = State(initialValue: notebookID)
    }

    /// For editing a note that already exists.
    init(store: NotesStore, goalsStore: GoalsStore, editing note: Note) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNote = note
        self.type = note.type
        _title = State(initialValue: note.title)
        _jotText = State(initialValue: note.jotText)
        _richText = State(initialValue: NSAttributedString.fromRTFData(note.richTextData))
        _checklistItems = State(initialValue: note.checklistItems.isEmpty ? [ChecklistItem()] : note.checklistItems)
        _linkedGoalID = State(initialValue: note.linkedGoalID)
        _notebookID = State(initialValue: note.notebookID)
    }

    private var isEditing: Bool { originalNote != nil }

    var body: some View {
        NavigationStack {
            Form {
                switch type {
                case .jot: jotSection
                case .list: listSection
                case .classic: classicSection
                }

                if type != .jot {
                    goalLinkSection
                    notebookSection
                }

                if let original = originalNote {
                    Button("Delete note", role: .destructive) {
                        store.deleteNote(original.id)
                        dismiss()
                    }
                }
            }
            .navigationTitle(navTitle)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Add") { save() }
                }
            }
        }
    }

    private var navTitle: String {
        switch type {
        case .jot: return isEditing ? "Edit jot" : "New jot"
        case .list: return isEditing ? "Edit list" : "New list"
        case .classic: return isEditing ? "Edit note" : "New note"
        }
    }

    // MARK: - Jot

    private var jotSection: some View {
        Section {
            TextEditor(text: $jotText)
                .frame(minHeight: 120)
        }
    }

    // MARK: - List

    private var listSection: some View {
        Group {
            Section("Title") {
                TextField("Title", text: $title)
            }
            Section("Items") {
                ForEach($checklistItems) { $item in
                    HStack {
                        Button {
                            item.done.toggle()
                        } label: {
                            CompletionMark(isOn: item.done, size: 20)
                        }
                        .buttonStyle(.plain)
                        TextField("Item", text: $item.text)
                            .strikethrough(item.done)
                    }
                }
                .onDelete { offsets in
                    checklistItems.remove(atOffsets: offsets)
                }
                Button {
                    checklistItems.append(ChecklistItem())
                } label: {
                    Label("Add item", systemImage: "plus")
                }
            }
        }
    }

    // MARK: - Classic

    private var classicSection: some View {
        Group {
            Section("Title") {
                TextField("Title", text: $title)
            }
            Section("Content") {
                HStack(spacing: 20) {
                    Button {
                        richTextController.toggleBold()
                    } label: {
                        Text("B").font(.body.bold())
                    }
                    Button {
                        richTextController.toggleItalic()
                    } label: {
                        Text("I").italic()
                    }
                    Button {
                        richTextController.applyHeading()
                    } label: {
                        Image(systemName: "textformat.size")
                    }
                    Spacer()
                }
                .buttonStyle(.plain)
                .padding(.vertical, 4)

                Text("Select some text first, then tap a style to apply it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                RichTextEditor(attributedText: $richText, controller: richTextController)
                    .frame(minHeight: 180)
            }
        }
    }

    // MARK: - Goal link

    private var goalLinkSection: some View {
        Section("Link to a goal (optional)") {
            GoalLinkPicker(goalsStore: goalsStore, selection: $linkedGoalID)
        }
    }

    private var notebookSection: some View {
        Section("Notebook (optional)") {
            Picker("Notebook", selection: $notebookID) {
                Text("None").tag(UUID?.none)
                ForEach(store.sortedNotebooks) { notebook in
                    Text(notebook.title).tag(Optional(notebook.id))
                }
            }
        }
    }

    // MARK: - Save

    private func save() {
        var note = originalNote ?? Note(type: type)
        note.title = title.trimmingCharacters(in: .whitespaces)
        note.jotText = jotText
        note.richTextData = richText.string.trimmingCharacters(in: .whitespaces).isEmpty ? nil : richText.rtfData
        note.checklistItems = checklistItems.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
        note.linkedGoalID = linkedGoalID
        note.notebookID = notebookID

        if originalNote != nil {
            store.updateNote(note)
        } else {
            store.addNote(note)
        }
        dismiss()
    }
}

