import SwiftUI

/// The same asymmetric tick mark from the app icon, as a drawable SwiftUI
/// Shape rather than an image — this is what lets it scale crisply at
/// any size and animate its stroke, neither of which a raster image can do.
struct LeverTickMark: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x / 100 * rect.width, y: rect.minY + y / 100 * rect.height)
        }
        path.move(to: point(15, 42))
        path.addLine(to: point(40, 82))
        path.addLine(to: point(88, 15))
        return path
    }
}

/// Replaces the plain system checkmark wherever something gets marked
/// done — a short-term goal's "Today" toggle, a milestone, a checklist
/// item. Uses our own lever mark instead of a generic checkmark, and
/// animates in with a spring bounce rather than just flipping instantly.
struct CompletionMark: View {
    var isOn: Bool
    var size: CGFloat = 20
    var color: Color = .vectisBlue

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(isOn ? color : Color.secondary.opacity(0.5), lineWidth: 1.5)

            if isOn {
                LeverTickMark()
                    .stroke(color, style: StrokeStyle(lineWidth: size * 0.16, lineCap: .round, lineJoin: .round))
                    .frame(width: size * 0.6, height: size * 0.6)
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
            }
        }
        .frame(width: size, height: size)
        .animation(.spring(response: 0.32, dampingFraction: 0.55), value: isOn)
    }
}

