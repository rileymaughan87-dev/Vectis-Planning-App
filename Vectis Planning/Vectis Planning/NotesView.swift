import SwiftUI

/// The Notes page: three sections — Jots, Lists, Notes — each sorted
/// with the most recently touched note first. Tap "+" to pick a type
/// before creating, tap any note to edit it, swipe to delete.
struct NotesView: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var searchText = ""
    @State private var showingTypePicker = false
    @State private var newNoteType: NoteType?
    @State private var editingNote: Note?
    @State private var showingNewNotebook = false
    @State private var openNotebook: Notebook?

    var body: some View {
        NavigationStack {
            List {
                notebooksSection
                section(title: "Jots", icon: "bolt.fill", notes: store.jots.filter(matches))
                section(title: "Lists", icon: "checklist", notes: store.lists.filter(matches))
                section(title: "Notes", icon: "note.text", notes: store.classicNotes.filter(matches))
            }
            .searchable(text: $searchText, prompt: "Search notes")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button {
                            showingTypePicker = true
                        } label: {
                            Label("New note", systemImage: "square.and.pencil")
                        }
                        Button {
                            showingNewNotebook = true
                        } label: {
                            Label("New notebook", systemImage: "books.vertical")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingTypePicker) {
                NoteTypePickerSheet { type in
                    showingTypePicker = false
                    newNoteType = type
                }
            }
            .sheet(isPresented: $showingNewNotebook) {
                NotebookEditorSheet(store: store, goalsStore: goalsStore)
            }
            .sheet(item: $newNoteType) { type in
                NoteEditorSheet(store: store, goalsStore: goalsStore, type: type)
            }
            .sheet(item: $editingNote) { note in
                NoteEditorSheet(store: store, goalsStore: goalsStore, editing: note)
            }
            .sheet(item: $openNotebook) { notebook in
                NotebookDetailView(notebook: notebook, store: store, goalsStore: goalsStore, appearanceStore: appearanceStore)
            }
        }
    }

    // MARK: - Notebooks

    @ViewBuilder
    private var notebooksSection: some View {
        let notebooks = store.sortedNotebooks
        if !notebooks.isEmpty {
            Section {
                ForEach(notebooks) { notebook in
                    Button {
                        openNotebook = notebook
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(notebook.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text("\(store.notes(in: notebook.id).count) notes")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let linkedTitle = linkedGoalTitle(notebook.linkedGoalID) {
                                    Label(linkedTitle, systemImage: "target")
                                        .font(.caption2)
                                        .foregroundStyle(appearanceStore.primaryColor)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteNotebook(notebooks[index].id)
                    }
                }
            } header: {
                HStack(spacing: 6) {
                    Image(systemName: "books.vertical")
                        .foregroundStyle(appearanceStore.primaryColor)
                    Text("Notebooks")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                }
                .textCase(nil)
                .padding(.bottom, 4)
            }
        }
    }

    // MARK: - Search

    private func matches(_ note: Note) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if query.isEmpty { return true }
        if note.title.lowercased().contains(query) { return true }
        if note.jotText.lowercased().contains(query) { return true }
        if NSAttributedString.fromRTFData(note.richTextData).string.lowercased().contains(query) { return true }
        if note.checklistItems.contains(where: { $0.text.lowercased().contains(query) }) { return true }
        return false
    }

    // MARK: - Sections

    @ViewBuilder
    private func section(title: String, icon: String, notes: [Note]) -> some View {
        if !notes.isEmpty {
            Section {
                ForEach(notes) { note in
                    Button {
                        editingNote = note
                    } label: {
                        noteRow(note)
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteNote(notes[index].id)
                    }
                }
            } header: {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .foregroundStyle(appearanceStore.primaryColor)
                    Text(title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                }
                .textCase(nil)
                .padding(.bottom, 4)
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
                Text(previewText(note))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if let linkedTitle = linkedGoalTitle(note.linkedGoalID) {
                Label(linkedTitle, systemImage: "target")
                    .font(.caption2)
                    .foregroundStyle(appearanceStore.primaryColor)
            }
        }
    }

    private func previewText(_ note: Note) -> String {
        switch note.type {
        case .classic:
            return NSAttributedString.fromRTFData(note.richTextData).string
        case .list:
            return note.checklistItems.map { $0.text }.joined(separator: ", ")
        case .jot:
            return note.jotText
        }
    }

    private func linkedGoalTitle(_ id: UUID?) -> String? {
        guard let id = id else { return nil }
        return goalsStore.goals.first { $0.id == id }?.title
    }
}

