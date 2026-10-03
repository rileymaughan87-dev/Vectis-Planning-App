import SwiftUI

/// The four fixed destinations under Record. Deliberately a small,
/// hardcoded enum rather than a data-driven list — these are structural
/// navigation, not something the person edits, which is also why the
/// selector below uses an underline indicator rather than the filled
/// chip style the (editable) category picker uses.
enum RecordSection: CaseIterable {
    case journal, notebooks, jots, notes

    var label: String {
        switch self {
        case .journal: return "Journal"
        case .notebooks: return "Notebooks"
        case .jots: return "Jots"
        case .notes: return "Lists & Notes"
        }
    }
}

/// The Record page (previously "Notes" — renamed because Jots, Lists,
/// Notebooks, and now Journal no longer fit under that name). A fixed
/// selector fully swaps the content below it between the four sections,
/// rather than stacking all four on one long scroll — which is what
/// let journal entries bury everything else underneath them.
struct RecordView: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var journalStore: JournalStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var section: RecordSection = .journal

    @State private var showingTypePicker = false
    @State private var newNoteType: NoteType?
    @State private var editingNote: Note?
    @State private var showingNewNotebook = false
    @State private var openNotebook: Notebook?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                selector
                Group {
                    switch section {
                    case .journal:
                        JournalSectionView(journalStore: journalStore, appearanceStore: appearanceStore)
                    case .notebooks:
                        NotebooksSectionView(
                            store: store,
                            goalsStore: goalsStore,
                            appearanceStore: appearanceStore,
                            onOpen: { openNotebook = $0 }
                        )
                    case .jots:
                        NotesListSectionView(
                            store: store,
                            goalsStore: goalsStore,
                            appearanceStore: appearanceStore,
                            notes: { store.jots },
                            searchPrompt: "Search jots",
                            onSelect: { editingNote = $0 }
                        )
                    case .notes:
                        NotesListSectionView(
                            store: store,
                            goalsStore: goalsStore,
                            appearanceStore: appearanceStore,
                            notes: { store.lists + store.classicNotes },
                            searchPrompt: "Search lists and notes",
                            onSelect: { editingNote = $0 }
                        )
                    }
                }
            }
            // No navigationTitle here, matching Goals and Home — the
            // app's own persistent chrome already shows the app name up
            // top, so a second big page-name heading directly under it
            // was pure redundancy, not helpful orientation.
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if section != .journal {
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
            }
            .sheet(isPresented: $showingTypePicker) {
                NoteTypePickerSheet(accentColor: appearanceStore.primaryColor) { type in
                    showingTypePicker = false
                    newNoteType = type
                }
            }
            .sheet(isPresented: $showingNewNotebook) {
                NotebookEditorSheet(store: store, goalsStore: goalsStore, accentColor: appearanceStore.primaryColor)
            }
            .sheet(item: $newNoteType) { type in
                NoteEditorSheet(store: store, goalsStore: goalsStore, type: type, accentColor: appearanceStore.primaryColor)
            }
            .sheet(item: $editingNote) { note in
                NoteEditorSheet(store: store, goalsStore: goalsStore, editing: note, accentColor: appearanceStore.primaryColor)
            }
            .sheet(item: $openNotebook) { notebook in
                NotebookDetailView(notebook: notebook, store: store, goalsStore: goalsStore, appearanceStore: appearanceStore)
            }
        }
    }

    // Note: the "+" toolbar button is hidden entirely while Journal is
    // active, rather than shown disabled or repurposed — Journal has
    // its own "Today" write button in its own header, so a second,
    // differently-behaving "+" in the nav bar at the same time would
    // just be confusing about which one to use.
    private var selector: some View {
        UnderlineSelector(
            options: RecordSection.allCases.map { (value: $0, label: $0.label) },
            selection: $section,
            accent: appearanceStore.primaryColor,
            horizontalPadding: 16
        )
    }
}

// MARK: - Notebooks segment

private struct NotebooksSectionView: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    let onOpen: (Notebook) -> Void

    private func linkedGoalTitle(_ id: UUID?) -> String? {
        guard let id else { return nil }
        return goalsStore.goals.first { $0.id == id }?.title
    }

    var body: some View {
        let notebooks = store.sortedNotebooks
        if notebooks.isEmpty {
            emptyState
        } else {
            List {
                ForEach(notebooks) { notebook in
                    Button {
                        onOpen(notebook)
                    } label: {
                        row(for: notebook)
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteNotebook(notebooks[index].id)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .listStyle(.plain)
        }
    }

    private func row(for notebook: Notebook) -> some View {
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

    private var emptyState: some View {
        VStack {
            Spacer()
            Text("No notebooks yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Jots / Lists & Notes segments

/// Shared by both the Jots and the Lists & Notes segments — same row
/// style and search behaviour, different source list. A closure rather
/// than a stored array so the source stays live as the store changes.
private struct NotesListSectionView: View {
    @ObservedObject var store: NotesStore
    @ObservedObject var goalsStore: GoalsStore
    @ObservedObject var appearanceStore: AppearanceStore
    let notes: () -> [Note]
    let searchPrompt: String
    let onSelect: (Note) -> Void

    @State private var searchText = ""

    private func matches(_ note: Note) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if query.isEmpty { return true }
        if note.title.lowercased().contains(query) { return true }
        if note.jotText.lowercased().contains(query) { return true }
        if NSAttributedString.fromRTFData(note.richTextData).string.lowercased().contains(query) { return true }
        if note.checklistItems.contains(where: { $0.text.lowercased().contains(query) }) { return true }
        return false
    }

    private func linkedGoalTitle(_ id: UUID?) -> String? {
        guard let id else { return nil }
        return goalsStore.goals.first { $0.id == id }?.title
    }

    var body: some View {
        let filtered = notes().filter(matches)
        if filtered.isEmpty && searchText.isEmpty {
            emptyState
        } else {
            List {
                ForEach(filtered) { note in
                    Button {
                        onSelect(note)
                    } label: {
                        row(for: note)
                    }
                }
                .onDelete { offsets in
                    for index in offsets {
                        store.deleteNote(filtered[index].id)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .listStyle(.plain)
            .searchable(text: $searchText, prompt: searchPrompt)
        }
    }

    private func row(for note: Note) -> some View {
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

    private var emptyState: some View {
        VStack {
            Spacer()
            Text("Nothing here yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

