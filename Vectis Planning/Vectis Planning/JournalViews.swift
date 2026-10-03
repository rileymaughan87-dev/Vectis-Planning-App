import SwiftUI

/// The Journal segment of Record: a month-grouped list by default, with
/// a calendar jump view and search for finding an entry once there are
/// months of them. Its own top-level view — kept separate from
/// `RecordView` itself — since this alone has list/calendar toggling,
/// search, and a detail sheet, and bundling that into the same body as
/// the other three segments is exactly the shape of expression that has
/// previously timed out the type checker in this project.
struct JournalSectionView: View {
    @ObservedObject var journalStore: JournalStore
    @ObservedObject var appearanceStore: AppearanceStore

    @State private var searchText = ""
    @State private var showingCalendar = false
    // IdentifiableDate rather than a plain Date, matching this
    // codebase's own established wrapper (already used for Long-Term)
    // for the same reason — Date has no Identifiable conformance, and
    // this project's convention is a small wrapper rather than
    // extending a Foundation type globally.
    @State private var openEntryDate: IdentifiableDate?

    var body: some View {
        VStack(spacing: 0) {
            header
            if showingCalendar {
                JournalCalendarJumpView(journalStore: journalStore) { date in
                    showingCalendar = false
                    openEntryDate = IdentifiableDate(date: date)
                }
            } else {
                JournalMonthList(journalStore: journalStore, searchText: searchText) { date in
                    openEntryDate = IdentifiableDate(date: date)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search entries")
        .sheet(item: $openEntryDate) { wrapped in
            JournalEntryDetailView(journalStore: journalStore, date: wrapped.date)
        }
    }

    private var header: some View {
        HStack {
            Spacer()
            Button {
                showingCalendar.toggle()
            } label: {
                Label(showingCalendar ? "List" : "Jump to date", systemImage: showingCalendar ? "list.bullet" : "calendar")
                    .font(.caption)
            }

            Button {
                openEntryDate = IdentifiableDate(date: Date())
            } label: {
                Label("Today", systemImage: "square.and.pencil")
                    .font(.caption)
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

// MARK: - Month-grouped list

private struct JournalMonthList: View {
    @ObservedObject var journalStore: JournalStore
    let searchText: String
    let onSelect: (Date) -> Void

    private var groups: [(month: String, entries: [JournalEntry])] {
        journalStore.groupedByMonth.compactMap { group in
            let filtered = group.entries.filter { journalStore.matches($0, query: searchText) }
            return filtered.isEmpty ? nil : (group.month, filtered)
        }
    }

    var body: some View {
        if journalStore.sortedEntries.isEmpty {
            emptyState
        } else {
            List {
                ForEach(groups, id: \.month) { group in
                    Section {
                        ForEach(group.entries) { entry in
                            Button {
                                onSelect(entry.date)
                            } label: {
                                JournalEntryRow(entry: entry)
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                journalStore.delete(group.entries[index].id)
                            }
                        }
                    } header: {
                        Text(group.month)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .textCase(nil)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .listStyle(.plain)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Spacer()
            Text("No entries yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Answer the evening review's prompt, or just write something.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

private struct JournalEntryRow: View {
    let entry: JournalEntry

    private var dayLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(entry.date) { return "Today" }
        if calendar.isDateInYesterday(entry.date) { return "Yesterday" }
        return entry.date.formatted(.dateTime.weekday(.wide).day())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(dayLabel)
                    .font(.subheadline.weight(.semibold))
                if entry.reflectionPrompt != nil {
                    Text("review")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .overlay(
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .strokeBorder(Color(.separator), lineWidth: 0.5)
                        )
                }
            }
            if let prompt = entry.reflectionPrompt {
                Text(prompt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .italic()
            }
            Text(entry.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Calendar jump view

/// Reuses `MonthGridView` — the same component Long-Term already
/// uses — pointed at journal data instead. Dots mark days with
/// an entry; tapping one opens it.
private struct JournalCalendarJumpView: View {
    @ObservedObject var journalStore: JournalStore
    let onSelectDay: (Date) -> Void

    @State private var displayedMonth = Date()

    var body: some View {
        ScrollView {
            MonthGridView(
                displayedMonth: $displayedMonth,
                items: { date in
                    guard journalStore.entry(for: date) != nil else { return [] }
                    return [LongTermDayItem(id: UUID(), title: "Journal", colorHex: "#185FA5", isMilestone: false)]
                },
                onSelectDay: { date in
                    guard journalStore.entry(for: date) != nil else { return }
                    onSelectDay(date)
                }
            )
            .padding()
        }
    }
}

// MARK: - Entry detail

struct JournalEntryDetailView: View {
    @ObservedObject var journalStore: JournalStore
    let date: Date

    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""

    private var dayLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private var existingPrompt: String? {
        journalStore.entry(for: date)?.reflectionPrompt
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 10) {
                if let prompt = existingPrompt {
                    Text(prompt)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .italic()
                }
                TextEditor(text: $text)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .background(
                        RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                Text("Answering the prompt starts the entry. Keep writing here anytime — same entry, one per day.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle(dayLabel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        journalStore.setText(date: date, text: text)
                        dismiss()
                    }
                }
            }
            .onAppear {
                text = journalStore.entry(for: date)?.text ?? ""
            }
        }
    }
}
