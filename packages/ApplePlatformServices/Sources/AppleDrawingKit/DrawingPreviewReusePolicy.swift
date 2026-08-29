import Foundation

enum DrawingPreviewReusePolicy {
    /// A preview saved with the drawing preserves the live canvas coordinate
    /// space. Thumbnail dimensions affect display only and must not invalidate
    /// that preview, because `PKDrawing.image(from:)` crops rather than scales.
    static func canReusePreview(
        modifiedAt previewModifiedAt: Date,
        forDrawingModifiedAt drawingModifiedAt: Date
    ) -> Bool {
        previewModifiedAt >= drawingModifiedAt
    }
}
