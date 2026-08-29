import Foundation
import Testing
@testable import AppleDrawingKit

@Suite("Drawing preview reuse policy")
struct DrawingPreviewReusePolicyTests {
    @Test("fresh saved previews preserve the drawing canvas coordinate space")
    func freshPreviewIsReused() {
        let drawingModifiedAt = Date(timeIntervalSince1970: 100)

        #expect(
            DrawingPreviewReusePolicy.canReusePreview(
                modifiedAt: drawingModifiedAt.addingTimeInterval(1),
                forDrawingModifiedAt: drawingModifiedAt
            )
        )
    }

    @Test("stale previews are rebuilt from authoritative drawing data")
    func stalePreviewIsNotReused() {
        let drawingModifiedAt = Date(timeIntervalSince1970: 100)

        #expect(
            !DrawingPreviewReusePolicy.canReusePreview(
                modifiedAt: drawingModifiedAt.addingTimeInterval(-1),
                forDrawingModifiedAt: drawingModifiedAt
            )
        )
    }
}
