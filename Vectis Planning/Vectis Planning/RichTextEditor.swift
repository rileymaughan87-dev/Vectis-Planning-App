import SwiftUI
import UIKit
import Combine

// Real inline rich text — bolding or italicizing part of a sentence,
// not a whole paragraph — isn't something pure SwiftUI can do on its
// own. This file bridges in UIKit's UITextView, which has supported
// this kind of editing since long before SwiftUI existed. Everything
// in this file is the "translation layer" that lets the rest of the
// app talk to that UIKit view using plain SwiftUI patterns.

extension NSAttributedString {
    /// Converts to RTF data for storage. RTF is a plain, well-established
    /// format for saving styled text, and — unlike NSAttributedString
    /// itself — converts cleanly to `Data`, which is what our Codable
    /// `Note` struct can actually save.
    var rtfData: Data? {
        try? data(
            from: NSRange(location: 0, length: length),
            documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf]
        )
    }

    /// The reverse: turns saved RTF data back into styled text to show
    /// in the editor. Falls back to empty text if there's nothing saved
    /// yet, or the data is somehow invalid.
    static func fromRTFData(_ data: Data?) -> NSAttributedString {
        guard let data,
              let attributed = try? NSAttributedString(
                data: data,
                options: [.documentType: NSAttributedString.DocumentType.rtf],
                documentAttributes: nil
              )
        else {
            return NSAttributedString(string: "")
        }
        return attributed
    }
}

/// Holds a live reference to the underlying UITextView so the toolbar
/// buttons (Bold, Italic, Heading) can apply formatting to whatever
/// text is currently selected, from outside the UIKit bridge itself.
final class RichTextViewController: ObservableObject {
    weak var textView: UITextView?
    var onChange: ((NSAttributedString) -> Void)?

    func toggleBold() { toggleTrait(.traitBold) }
    func toggleItalic() { toggleTrait(.traitItalic) }

    /// Flips a font trait (bold or italic) on and off across the current
    /// selection. If part of the selection is already bold and part
    /// isn't, this makes it all bold first — a second tap then removes it.
    private func toggleTrait(_ trait: UIFontDescriptor.SymbolicTraits) {
        guard let textView, textView.selectedRange.length > 0 else { return }
        let range = textView.selectedRange
        let storage = textView.textStorage

        storage.beginEditing()
        storage.enumerateAttribute(.font, in: range, options: []) { value, subrange, _ in
            let currentFont = (value as? UIFont) ?? UIFont.systemFont(ofSize: 16)
            var traits = currentFont.fontDescriptor.symbolicTraits
            if traits.contains(trait) {
                traits.remove(trait)
            } else {
                traits.insert(trait)
            }
            if let descriptor = currentFont.fontDescriptor.withSymbolicTraits(traits) {
                storage.addAttribute(.font, value: UIFont(descriptor: descriptor, size: currentFont.pointSize), range: subrange)
            }
        }
        storage.endEditing()

        textView.selectedRange = range
        onChange?(textView.attributedText)
    }

    /// Headings are simpler than bold/italic — just a bigger, bold font
    /// applied directly, rather than toggling a trait on the existing one.
    func applyHeading() {
        guard let textView, textView.selectedRange.length > 0 else { return }
        let range = textView.selectedRange
        textView.textStorage.beginEditing()
        textView.textStorage.addAttribute(.font, value: UIFont.boldSystemFont(ofSize: 20), range: range)
        textView.textStorage.endEditing()
        textView.selectedRange = range
        onChange?(textView.attributedText)
    }
}

/// The SwiftUI-facing wrapper. `UIViewRepresentable` is the standard
/// bridge type for dropping a UIKit view into SwiftUI — this is what
/// lets `RichTextEditor` get used in a `Form` just like any other
/// SwiftUI view, even though a real UITextView is doing the work.
struct RichTextEditor: UIViewRepresentable {
    @Binding var attributedText: NSAttributedString
    let controller: RichTextViewController

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.font = .systemFont(ofSize: 16)
        textView.attributedText = attributedText
        textView.isScrollEnabled = true
        textView.delegate = context.coordinator

        controller.textView = textView
        controller.onChange = { newValue in
            attributedText = newValue
        }
        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        controller.textView = uiView
        // Only push a new value in if it's actually different — otherwise
        // every keystroke would reset the cursor back to the start, since
        // SwiftUI re-renders after every change to `attributedText`.
        if !uiView.attributedText.isEqual(to: attributedText) {
            let selection = uiView.selectedRange
            uiView.attributedText = attributedText
            uiView.selectedRange = selection
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $attributedText)
    }

    class Coordinator: NSObject, UITextViewDelegate {
        var text: Binding<NSAttributedString>
        init(text: Binding<NSAttributedString>) { self.text = text }

        func textViewDidChange(_ textView: UITextView) {
            text.wrappedValue = textView.attributedText
        }
    }
}
