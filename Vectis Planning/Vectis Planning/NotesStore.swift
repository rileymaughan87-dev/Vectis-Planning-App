import Foundation
import Combine
import UIKit

/// Holds every note and the logic to read/update/delete them. Same
/// pattern as GoalsStore and CalendarStore — one shared source of truth.
class NotesStore: ObservableObject {
    @Published var notes: [Note] = []
    @Published var notebooks: [Notebook] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        if let savedNotes = PersistenceManager.load([Note].self, from: PersistenceManager.Filename.notes) {
            notes = savedNotes
        } else {
            notes = NotesStore.sampleNotes()
        }
        if let savedNotebooks = PersistenceManager.load([Notebook].self, from: PersistenceManager.Filename.notebooks) {
            notebooks = savedNotebooks
        }

        $notes
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.notes) }
            .store(in: &cancellables)

        $notebooks
            .dropFirst()
            .sink { PersistenceManager.save($0, to: PersistenceManager.Filename.notebooks) }
            .store(in: &cancellables)
    }

    // MARK: - Grouped, sorted lists — these back the sections on the
    // Notes page. Notes inside a notebook are deliberately excluded
    // here, since they show up under their notebook instead of
    // appearing twice.

    var jots: [Note] {
        notes.filter { $0.type == .jot && $0.notebookID == nil }.sorted { $0.updatedDate > $1.updatedDate }
    }
    var lists: [Note] {
        notes.filter { $0.type == .list && $0.notebookID == nil }.sorted { $0.updatedDate > $1.updatedDate }
    }
    var classicNotes: [Note] {
        notes.filter { $0.type == .classic && $0.notebookID == nil }.sorted { $0.updatedDate > $1.updatedDate }
    }

    var sortedNotebooks: [Notebook] {
        notebooks.sorted { $0.createdDate > $1.createdDate }
    }

    func notes(in notebookID: UUID) -> [Note] {
        notes.filter { $0.notebookID == notebookID }.sorted { $0.updatedDate > $1.updatedDate }
    }

    // MARK: - Writing

    func addNotebook(_ notebook: Notebook) {
        notebooks.append(notebook)
    }

    func updateNotebook(_ updated: Notebook) {
        guard let index = notebooks.firstIndex(where: { $0.id == updated.id }) else { return }
        notebooks[index] = updated
    }

    /// Deleting a notebook keeps its notes — they just become loose
    /// again and reappear under their own type's section. Silently
    /// deleting a pile of notes along with the notebook would be a
    /// nasty surprise, so this errs toward keeping your writing.
    func deleteNotebook(_ id: UUID) {
        for index in notes.indices where notes[index].notebookID == id {
            notes[index].notebookID = nil
        }
        notebooks.removeAll { $0.id == id }
    }

    func addNote(_ note: Note) {
        var newNote = note
        newNote.updatedDate = Date()
        notes.append(newNote)
    }

    func updateNote(_ updated: Note) {
        guard let index = notes.firstIndex(where: { $0.id == updated.id }) else { return }
        var saved = updated
        saved.updatedDate = Date()
        notes[index] = saved
    }

    func deleteNote(_ id: UUID) {
        notes.removeAll { $0.id == id }
    }

    // MARK: - Sample data

    static func sampleNotes() -> [Note] {
        var jot1 = Note(type: .jot)
        jot1.jotText = "Wifi password: sunflower22"

        var jot2 = Note(type: .jot)
        jot2.jotText = "4 cups flour, 2 eggs, 1 cup sugar"

        var list1 = Note(type: .list)
        list1.title = "Grocery list"
        list1.checklistItems = [
            ChecklistItem(text: "Oat milk", done: true),
            ChecklistItem(text: "Eggs", done: false),
            ChecklistItem(text: "Spinach", done: false)
        ]

        var classic1 = Note(type: .classic)
        classic1.title = "Trip planning"
        let sampleText = NSMutableAttributedString(
            string: "Flights booked for June 14\n",
            attributes: [.font: UIFont.boldSystemFont(ofSize: 16)]
        )
        sampleText.append(NSAttributedString(
            string: "Need to sort out accommodation still. ",
            attributes: [.font: UIFont.systemFont(ofSize: 16)]
        ))
        sampleText.append(NSAttributedString(
            string: "Check reviews before booking.",
            attributes: [.font: UIFont.italicSystemFont(ofSize: 16)]
        ))
        classic1.richTextData = sampleText.rtfData

        return [jot1, jot2, list1, classic1]
    }
}

