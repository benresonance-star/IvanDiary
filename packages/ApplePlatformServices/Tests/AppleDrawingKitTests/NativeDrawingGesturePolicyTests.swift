import Testing
@testable import AppleDrawingKit

@Suite("Native drawing gesture policy")
struct NativeDrawingGesturePolicyTests {
    @Test("Apple Pencil is reserved for drawing")
    func pencilDoesNotTriggerContentInteractions() {
        #expect(
            NativeDrawingGesturePolicy.permitsContentInteraction(for: .direct)
        )
        #expect(
            !NativeDrawingGesturePolicy.permitsContentInteraction(for: .pencil)
        )
    }

    @Test("drawing starts without waiting for content gestures")
    func drawingDoesNotWaitForContentInteractions() {
        #expect(!NativeDrawingGesturePolicy.drawingWaitsForContentInteraction)
    }
}
