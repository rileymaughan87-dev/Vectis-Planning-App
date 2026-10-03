import SwiftUI

/// A goal picker offering *every* goal — long-term, standalone
/// short-term, and daily habits nested under a long-term goal.
///
/// That last group was previously missing: a note could link to
/// "Finish degree" or a loose habit like "Read for 30 min", but not to
/// "Study 1 hour" sitting under a long-term goal. Nested habits are
/// labelled with their parent so two similarly-named habits under
/// different goals stay tellable apart.
struct GoalLinkPicker: View {
    @ObservedObject var goalsStore: GoalsStore
    @Binding var selection: UUID?
    var label: String = "Goal"

    var body: some View {
        Picker(label, selection: $selection) {
            Text("None").tag(UUID?.none)

            if !goalsStore.longTermGoals.isEmpty {
                Section("Long-term") {
                    ForEach(goalsStore.longTermGoals) { goal in
                        Text(goal.title).tag(Optional(goal.id))
                    }
                }
            }

            if !goalsStore.standaloneShortTermGoals.isEmpty {
                Section("Short-term") {
                    ForEach(goalsStore.standaloneShortTermGoals) { goal in
                        Text(goal.title).tag(Optional(goal.id))
                    }
                }
            }

            let nested = goalsStore.goals.filter { $0.linkedToGoalID != nil }
            if !nested.isEmpty {
                Section("Daily habits") {
                    ForEach(nested) { habit in
                        Text(habitLabel(habit)).tag(Optional(habit.id))
                    }
                }
            }
        }
    }

    /// "Study 1 hour (Finish degree)" rather than just "Study 1 hour",
    /// so habits under different parent goals don't look identical.
    private func habitLabel(_ habit: Goal) -> String {
        guard let parentID = habit.linkedToGoalID,
              let parent = goalsStore.goals.first(where: { $0.id == parentID })
        else {
            return habit.title
        }
        return "\(habit.title) (\(parent.title))"
    }
}

/// Creating or editing a notebook — just a name and an optional goal
/// link. Notes get moved into it from the note editor itself.
struct NotebookEditorSheet: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore
    let originalNotebook: Notebook?
    var accentColor: Color = .vectisBlue

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var linkedGoalID: UUID?

    init(store: NotesStore, goalsStore: GoalsStore, accentColor: Color = .vectisBlue) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNotebook = nil
        self.accentColor = accentColor
        _title = State(initialValue: "")
        _linkedGoalID = State(initialValue: nil)
    }

    init(store: NotesStore, goalsStore: GoalsStore, editing notebook: Notebook, accentColor: Color = .vectisBlue) {
        self.store = store
        self.goalsStore = goalsStore
        self.originalNotebook = notebook
        self.accentColor = accentColor
        _title = State(initialValue: notebook.title)
        _linkedGoalID = State(initialValue: notebook.linkedGoalID)
    }

    private var isEditing: Bool { originalNotebook != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    EditorTitleBox(label: "Name", placeholder: "Notebook name", text: $title, accent: accentColor)

                    EditorBox(title: "Link to a goal (optional)", accent: accentColor) {
                        GoalLinkPicker(goalsStore: goalsStore, selection: $linkedGoalID)
                            .font(.subheadline)
                            .tint(accentColor)
                    }

                    if let original = originalNotebook {
                        VStack(spacing: 6) {
                            Button("Delete notebook") {
                                store.deleteNotebook(original.id)
                                dismiss()
                            }
                            .buttonStyle(VectisButtonStyle(kind: .destructive))
                            Text("Notes inside this notebook won't be deleted — they'll move back to their own sections.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .navigationTitle(isEditing ? "Edit notebook" : "New notebook")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Create") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        var notebook = originalNotebook ?? Notebook(title: "")
        notebook.title = title.trimmingCharacters(in: .whitespaces)
        notebook.linkedGoalID = linkedGoalID

        if isEditing {
            store.updateNotebook(notebook)
        } else {
            store.addNotebook(notebook)
        }
        dismiss()
    }
}

/// The contents of one notebook — every note filed inside it, of any
/// type, with the same tap-to-edit and swipe-to-delete behaviour as
/// the main Notes list.
struct NotebookDetailView: View {
    let notebook: Notebook
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @Environment(\.dismiss) private var dismiss
    @State private var editingNote: Note?
    @State private var showingEditNotebook = false
    @State private var showingTypePicker = false
    @State private var newNoteType: NoteType?

    private var notesInNotebook: [Note] {
        store.notes(in: notebook.id)
    }

    var body: some View {
        NavigationStack {
            List {
                if notesInNotebook.isEmpty {
                    Text("No notes in this notebook yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ForEach(notesInNotebook) { note in
                    Button {
                        editingNote = note
                    } label: {
                        noteRow(note)
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteNote(notesInNotebook[index].id)
                    }
                }

                Button {
                    showingTypePicker = true
                } label: {
                    Label("Add note to this notebook", systemImage: "plus")
                }
            }
            .navigationTitle(notebook.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Edit") { showingEditNotebook = true }
                }
            }
            .sheet(isPresented: $showingEditNotebook) {
                NotebookEditorSheet(store: store, goalsStore: goalsStore, editing: notebook, accentColor: appearanceStore.primaryColor)
            }
            .sheet(isPresented: $showingTypePicker) {
                NoteTypePickerSheet(accentColor: appearanceStore.primaryColor) { type in
                    showingTypePicker = false
                    newNoteType = type
                }
            }
            .sheet(item: $newNoteType) { type in
                // Passing the notebook's ID files the new note straight
                // into this notebook, rather than creating it loose and
                // making you go link it afterwards.
                NoteEditorSheet(store: store, goalsStore: goalsStore, type: type, inNotebook: notebook.id, accentColor: appearanceStore.primaryColor)
            }
            .sheet(item: $editingNote) { note in
                NoteEditorSheet(store: store, goalsStore: goalsStore, editing: note, accentColor: appearanceStore.primaryColor)
            }
        }
    }

    private func noteRow(_ note: Note) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if note.type == .jot {
                Text(note.jotText.isEmpty ? "Empty jot" : note.jotText)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            } else {
                Text(note.title.isEmpty ? "Untitled" : note.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
            }
        }
    }
}

