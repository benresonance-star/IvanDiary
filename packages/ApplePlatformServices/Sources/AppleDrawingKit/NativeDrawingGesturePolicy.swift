public enum NativeDrawingTouchKind: Equatable, Sendable {
    case direct
    case pencil
}

public enum NativeDrawingGesturePolicy {
    public static func permitsContentInteraction(
        for touch: NativeDrawingTouchKind
    ) -> Bool {
        touch == .direct
    }

    public static let drawingWaitsForContentInteraction = false
}
