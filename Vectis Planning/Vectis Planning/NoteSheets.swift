import SwiftUI

/// Shown before creating a new note — pick Jot, List, or Note, and the
/// editor that opens next is tailored to that choice.
struct NoteTypePickerSheet: View {
    var accentColor: Color = .vectisBlue
    let onSelect: (NoteType) -> Void
    @Environment(\.dismiss) private var dismiss

    private let options: [(type: NoteType, icon: String, label: String, description: String)] = [
        (.jot, "bolt.fill", "Jot", "Quick, titleless, fast to capture"),
        (.list, "checklist", "List", "Starts with a checklist ready to go"),
        (.classic, "note.text", "Note", "A regular note with formatting")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(options, id: \.type) { option in
                        Button {
                            onSelect(option.type)
                        } label: {
                            optionRow(option)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("New note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func optionRow(_ option: (type: NoteType, icon: String, label: String, description: String)) -> some View {
        HStack(spacing: 12) {
            Image(systemName: option.icon)
                .foregroundStyle(accentColor)
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
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.cardRadius, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
        .contentShape(Rectangle())
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
    let accentColor: Color

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
    init(store: NotesStore, goalsStore: GoalsStore, type: NoteType, inNotebook notebookID: UUID? = nil, accentColor: Color = .vectisBlue) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNote = nil
        self.type = type
        self.accentColor = accentColor
        _title = State(initialValue: "")
        _jotText = State(initialValue: "")
        _richText = State(initialValue: NSAttributedString(string: ""))
        _checklistItems = State(initialValue: type == .list ? [ChecklistItem()] : [])
        _linkedGoalID = State(initialValue: nil)
        _notebookID = State(initialValue: notebookID)
    }

    /// For editing a note that already exists.
    init(store: NotesStore, goalsStore: GoalsStore, editing note: Note, accentColor: Color = .vectisBlue) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNote = note
        self.type = note.type
        self.accentColor = accentColor
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
            ScrollView {
                VStack(spacing: 10) {
                    switch type {
                    case .jot: jotBox
                    case .list: listBoxes
                    case .classic: classicBoxes
                    }

                    if type != .jot {
                        linksBox
                    }

                    if let original = originalNote {
                        Button("Delete \(typeName)") {
                            store.deleteNote(original.id)
                            dismiss()
                        }
                        .buttonStyle(VectisButtonStyle(kind: .destructive))
                        .padding(.top, 4)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
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

    private var typeName: String {
        switch type {
        case .jot: return "jot"
        case .list: return "list"
        case .classic: return "note"
        }
    }

    private var navTitle: String {
        isEditing ? "Edit \(typeName)" : "New \(typeName)"
    }

    /// A text area in the same inset style as the editor's other fields.
    private func insetField<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(Color(.tertiarySystemGroupedBackground))
            )
    }

    // MARK: - Jot

    private var jotBox: some View {
        EditorBox(title: "Jot", accent: accentColor) {
            insetField {
                TextEditor(text: $jotText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 160)
            }
        }
    }

    // MARK: - List

    private var listBoxes: some View {
        VStack(spacing: 10) {
            EditorTitleBox(placeholder: "Title", text: $title, accent: accentColor)
            EditorBox(title: "Items", accent: accentColor, trailing: itemsSummary) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach($checklistItems) { $item in
                        ChecklistRow(item: $item, accent: accentColor) {
                            let id = item.id
                            checklistItems.removeAll { $0.id == id }
                        }
                    }
                    Button {
                        checklistItems.append(ChecklistItem())
                    } label: {
                        Label("Add item", systemImage: "plus")
                    }
                    .buttonStyle(VectisButtonStyle(kind: .secondary, accent: accentColor))
                }
            }
        }
    }

    private var itemsSummary: String? {
        let filled = checklistItems.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !filled.isEmpty else { return nil }
        return "\(filled.filter { $0.done }.count) of \(filled.count) done"
    }

    // MARK: - Classic

    private var classicBoxes: some View {
        VStack(spacing: 10) {
            EditorTitleBox(placeholder: "Title", text: $title, accent: accentColor)
            EditorBox(title: "Content", accent: accentColor) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 20) {
                        Button {
                            richTextController.toggleBold()
                        } label: {
                            Text("B").font(.body.bold())
                        }
                        .accessibilityLabel("Bold")
                        Button {
                            richTextController.toggleItalic()
                        } label: {
                            Text("I").italic()
                        }
                        .accessibilityLabel("Italic")
                        Button {
                            richTextController.applyHeading()
                        } label: {
                            Image(systemName: "textformat.size")
                        }
                        .accessibilityLabel("Heading")
                        Spacer()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(accentColor)

                    Text("Select some text first, then tap a style to apply it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    insetField {
                        RichTextEditor(attributedText: $richText, controller: richTextController)
                            .frame(minHeight: 240)
                    }
                }
            }
        }
    }

    // MARK: - Links

    private var linksBox: some View {
        EditorBox(title: "Links (optional)", accent: accentColor) {
            VStack(spacing: 8) {
                GoalLinkPicker(goalsStore: goalsStore, selection: $linkedGoalID)
                Divider()
                Picker("Notebook", selection: $notebookID) {
                    Text("None").tag(UUID?.none)
                    ForEach(store.sortedNotebooks) { notebook in
                        Text(notebook.title).tag(Optional(notebook.id))
                    }
                }
            }
            .font(.subheadline)
            .tint(accentColor)
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

/// One checklist line: tick, text, and a remove button (the editor is a
/// scroll view now, so swipe-to-delete from the old Form is gone).
private struct ChecklistRow: View {
    @Binding var item: ChecklistItem
    let accent: Color
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button {
                item.done.toggle()
            } label: {
                CompletionMark(isOn: item.done, size: 20, color: accent)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.done ? "Mark not done" : "Mark done")
            TextField("Item", text: $item.text)
                .font(.subheadline)
                .strikethrough(item.done)
            Button(action: onDelete) {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Delete item")
        }
    }
}
