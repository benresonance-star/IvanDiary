#if canImport(UIKit)
import PencilKit
import UIKit

public struct LegacyInkPoint: Sendable {
    public let x: Double
    public let y: Double
    public let pressure: Double
    public let timestamp: Double

    public init(x: Double, y: Double, pressure: Double, timestamp: Double) {
        self.x = x
        self.y = y
        self.pressure = pressure
        self.timestamp = timestamp
    }
}

public struct LegacyInkStroke: Sendable {
    public let color: String
    public let width: Double
    public let points: [LegacyInkPoint]

    public init(color: String, width: Double, points: [LegacyInkPoint]) {
        self.color = color
        self.width = width
        self.points = points
    }
}

public struct LegacyInkDocument: Sendable {
    public let width: Double
    public let height: Double
    public let strokes: [LegacyInkStroke]

    public init(width: Double, height: Double, strokes: [LegacyInkStroke]) {
        self.width = width
        self.height = height
        self.strokes = strokes
    }
}

public enum LegacyInkImport {
    private static let comparisonTolerance: CGFloat = 0.75

    public static func strokes(
        from document: LegacyInkDocument,
        canvasSize: CGSize
    ) -> [PKStroke] {
        guard document.width > 0, document.height > 0,
              canvasSize.width > 0, canvasSize.height > 0 else {
            return []
        }
        let scaleX = canvasSize.width / document.width
        let scaleY = canvasSize.height / document.height

        return document.strokes.compactMap { stroke in
            guard stroke.points.count >= 1 else {
                return nil
            }
            let start = stroke.points[0].timestamp
            let inkColor = PencilInkColor.fromHexRGB(stroke.color)
            let baseWidth = max(1, stroke.width * ((scaleX + scaleY) / 2))
            let controlPoints = stroke.points.map { point -> PKStrokePoint in
                let force = max(0.05, min(point.pressure > 0 ? point.pressure : 0.5, 1))
                let size = max(0.8, baseWidth * (0.55 + force * 0.9))
                return PKStrokePoint(
                    location: CGPoint(
                        x: point.x * scaleX,
                        y: point.y * scaleY
                    ),
                    timeOffset: max(0, (point.timestamp - start) / 1000),
                    size: CGSize(width: size, height: size),
                    opacity: 1,
                    force: force,
                    azimuth: 0,
                    altitude: .pi / 2
                )
            }
            let path = PKStrokePath(
                controlPoints: controlPoints,
                creationDate: Date()
            )
            return PKStroke(
                ink: PKInk(.pen, color: inkColor),
                path: path
            )
        }
    }

    public static func merging(
        _ drawing: PKDrawing,
        with document: LegacyInkDocument,
        canvasSize: CGSize
    ) -> PKDrawing {
        let imported = missingStrokes(
            from: document,
            in: drawing,
            canvasSize: canvasSize
        )
        guard !imported.isEmpty else {
            return drawing
        }
        var merged = drawing
        merged.strokes.append(contentsOf: imported)
        return merged
    }

    public static func missingStrokes(
        from document: LegacyInkDocument,
        in drawing: PKDrawing,
        canvasSize: CGSize
    ) -> [PKStroke] {
        strokes(from: document, canvasSize: canvasSize).filter { candidate in
            !drawing.strokes.contains { existing in
                equivalent(existing, candidate)
            }
        }
    }

    private static func equivalent(_ left: PKStroke, _ right: PKStroke) -> Bool {
        guard left.ink.inkType == right.ink.inkType,
              left.path.count == right.path.count,
              approximatelyEqual(left.renderBounds, right.renderBounds),
              approximatelyEqual(
                left.path.first?.location,
                right.path.first?.location
              ),
              approximatelyEqual(
                left.path.last?.location,
                right.path.last?.location
              ) else {
            return false
        }
        return true
    }

    private static func approximatelyEqual(_ left: CGRect, _ right: CGRect) -> Bool {
        abs(left.minX - right.minX) <= comparisonTolerance &&
            abs(left.minY - right.minY) <= comparisonTolerance &&
            abs(left.width - right.width) <= comparisonTolerance &&
            abs(left.height - right.height) <= comparisonTolerance
    }

    private static func approximatelyEqual(
        _ left: CGPoint?,
        _ right: CGPoint?
    ) -> Bool {
        guard let left, let right else {
            return left == nil && right == nil
        }
        return abs(left.x - right.x) <= comparisonTolerance &&
            abs(left.y - right.y) <= comparisonTolerance
    }
}
#endif
