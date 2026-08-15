#if canImport(UIKit)
import CoreGraphics
import PencilKit
import UIKit

public enum DrawingGridVisualType: String, Sendable {
    case lines
    case dots
}

public struct DrawingGridSettings: Sendable, Equatable {
    public static let defaultColorHex = "#435b70"

    public let enabled: Bool
    public let snapToGrid: Bool
    public let spacing: CGFloat
    public let rotationDegrees: CGFloat
    public let origin: CGPoint
    public let pageSize: CGSize
    public let documentSize: CGSize
    public let type: DrawingGridVisualType
    public let colorHex: String

    public init(
        enabled: Bool,
        snapToGrid: Bool = true,
        spacing: CGFloat,
        rotationDegrees: CGFloat,
        origin: CGPoint = .zero,
        pageSize: CGSize = CGSize(width: 1200, height: 820),
        documentSize: CGSize = CGSize(width: 1200, height: 820),
        type: DrawingGridVisualType = .lines,
        colorHex: String = DrawingGridSettings.defaultColorHex
    ) {
        self.enabled = enabled
        self.snapToGrid = snapToGrid
        self.spacing = spacing
        self.rotationDegrees = rotationDegrees
        self.origin = origin
        self.pageSize = pageSize
        self.documentSize = documentSize
        self.type = type
        self.colorHex = DrawingGridSettings.isHexColor(colorHex)
            ? colorHex
            : DrawingGridSettings.defaultColorHex
    }

    public static let off = DrawingGridSettings(
        enabled: false,
        snapToGrid: true,
        spacing: 60,
        rotationDegrees: 0,
        origin: .zero,
        pageSize: CGSize(width: 1200, height: 820),
        documentSize: CGSize(width: 1200, height: 820),
        type: .lines,
        colorHex: defaultColorHex
    )

    public static func clampedRotation(_ degrees: Double) -> CGFloat {
        let step = 15.0
        let maximum = 75.0
        let snapped = (degrees / step).rounded() * step
        return CGFloat(min(maximum, max(-maximum, snapped)))
    }

    private static func isHexColor(_ value: String) -> Bool {
        guard value.count == 7, value.first == "#" else { return false }
        return value.dropFirst().allSatisfy(\.isHexDigit)
    }
}

@MainActor
final class DrawingGridGuideView: UIView {
    var grid: DrawingGridSettings = .off {
        didSet {
            isHidden = !grid.enabled
            setNeedsDisplay()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
        isHidden = true
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard grid.enabled,
              grid.spacing > 0,
              grid.spacing.isFinite,
              bounds.width > 0,
              bounds.height > 0,
              let context = UIGraphicsGetCurrentContext() else {
            return
        }

        let localBounds = visibleLocalBounds()
        guard localBounds.minX.isFinite,
              localBounds.minY.isFinite,
              localBounds.maxX.isFinite,
              localBounds.maxY.isFinite else {
            return
        }
        let firstX = floor(localBounds.minX / grid.spacing) * grid.spacing
        let firstY = floor(localBounds.minY / grid.spacing) * grid.spacing
        let color = PencilInkColor.fromHexRGB(grid.colorHex, alpha: 1)

        switch grid.type {
        case .lines:
            drawLines(
                in: context,
                bounds: localBounds,
                firstX: firstX,
                firstY: firstY,
                color: color
            )
        case .dots:
            drawDots(
                in: context,
                bounds: localBounds,
                firstX: firstX,
                firstY: firstY,
                color: color
            )
        }
    }

    private func drawLines(
        in context: CGContext,
        bounds localBounds: CGRect,
        firstX: CGFloat,
        firstY: CGFloat,
        color: UIColor
    ) {
        let path = UIBezierPath()
        var x = firstX
        while x <= localBounds.maxX {
            path.move(to: viewPoint(fromLocal: CGPoint(x: x, y: localBounds.minY)))
            path.addLine(to: viewPoint(fromLocal: CGPoint(x: x, y: localBounds.maxY)))
            x += grid.spacing
        }
        var y = firstY
        while y <= localBounds.maxY {
            path.move(to: viewPoint(fromLocal: CGPoint(x: localBounds.minX, y: y)))
            path.addLine(to: viewPoint(fromLocal: CGPoint(x: localBounds.maxX, y: y)))
            y += grid.spacing
        }
        context.addPath(path.cgPath)
        context.setStrokeColor(color.withAlphaComponent(0.34).cgColor)
        context.setLineWidth(1.5)
        context.strokePath()
    }

    private func drawDots(
        in context: CGContext,
        bounds localBounds: CGRect,
        firstX: CGFloat,
        firstY: CGFloat,
        color: UIColor
    ) {
        let radius = max(2.2, min(3.5, grid.spacing / 20))
        context.setFillColor(color.withAlphaComponent(0.48).cgColor)
        var x = firstX
        while x <= localBounds.maxX {
            var y = firstY
            while y <= localBounds.maxY {
                let center = viewPoint(fromLocal: CGPoint(x: x, y: y))
                context.fillEllipse(
                    in: CGRect(
                        x: center.x - radius,
                        y: center.y - radius,
                        width: radius * 2,
                        height: radius * 2
                    )
                )
                y += grid.spacing
            }
            x += grid.spacing
        }
    }

    private func visibleLocalBounds() -> CGRect {
        let corners = [
            CGPoint(x: bounds.minX, y: bounds.minY),
            CGPoint(x: bounds.maxX, y: bounds.minY),
            CGPoint(x: bounds.minX, y: bounds.maxY),
            CGPoint(x: bounds.maxX, y: bounds.maxY)
        ].map(localPoint)
        let xValues = corners.map(\.x)
        let yValues = corners.map(\.y)
        return CGRect(
            x: xValues.min() ?? 0,
            y: yValues.min() ?? 0,
            width: (xValues.max() ?? 0) - (xValues.min() ?? 0),
            height: (yValues.max() ?? 0) - (yValues.min() ?? 0)
        )
    }

    private func localPoint(_ point: CGPoint) -> CGPoint {
        let document = documentPoint(point)
        let center = CGPoint(
            x: grid.documentSize.width / 2,
            y: grid.documentSize.height / 2
        )
        let centered = CGPoint(x: document.x - center.x, y: document.y - center.y)
        let angle = grid.rotationDegrees * .pi / 180
        return CGPoint(
            x: centered.x * cos(angle) + centered.y * sin(angle),
            y: -centered.x * sin(angle) + centered.y * cos(angle)
        )
    }

    private func viewPoint(fromLocal point: CGPoint) -> CGPoint {
        let angle = grid.rotationDegrees * .pi / 180
        let center = CGPoint(
            x: grid.documentSize.width / 2,
            y: grid.documentSize.height / 2
        )
        return viewPoint(
            CGPoint(
                x: point.x * cos(angle) - point.y * sin(angle) + center.x,
                y: point.x * sin(angle) + point.y * cos(angle) + center.y
            )
        )
    }

    private func documentPoint(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: (point.x + grid.origin.x)
                * max(grid.documentSize.width, 1)
                / max(grid.pageSize.width, 1),
            y: (point.y + grid.origin.y)
                * max(grid.documentSize.height, 1)
                / max(grid.pageSize.height, 1)
        )
    }

    private func viewPoint(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: point.x
                * max(grid.pageSize.width, 1)
                / max(grid.documentSize.width, 1)
                - grid.origin.x,
            y: point.y
                * max(grid.pageSize.height, 1)
                / max(grid.documentSize.height, 1)
                - grid.origin.y
        )
    }
}

enum DrawingGridSnap {
    static func stroke(_ stroke: PKStroke, to grid: DrawingGridSettings) -> PKStroke {
        guard grid.enabled, grid.snapToGrid, stroke.path.count > 1 else { return stroke }
        let points = (0..<stroke.path.count).map { stroke.path[$0] }
        guard let first = points.first, let last = points.last else { return stroke }
        let angle = grid.rotationDegrees * .pi / 180
        let cosAngle = cos(angle)
        let sinAngle = sin(angle)
        let pageWidth = max(grid.pageSize.width, 1)
        let pageHeight = max(grid.pageSize.height, 1)
        let documentWidth = max(grid.documentSize.width, 1)
        let documentHeight = max(grid.documentSize.height, 1)
        let center = CGPoint(x: documentWidth / 2, y: documentHeight / 2)
        func documentPoint(_ point: CGPoint) -> CGPoint {
            CGPoint(
                x: (point.x + grid.origin.x) * documentWidth / pageWidth,
                y: (point.y + grid.origin.y) * documentHeight / pageHeight
            )
        }
        func local(_ point: CGPoint) -> CGPoint {
            let document = documentPoint(point)
            let centered = CGPoint(x: document.x - center.x, y: document.y - center.y)
            return CGPoint(
                x: centered.x * cosAngle + centered.y * sinAngle,
                y: -centered.x * sinAngle + centered.y * cosAngle
            )
        }
        func viewPoint(_ point: CGPoint) -> CGPoint {
            CGPoint(
                x: point.x * pageWidth / documentWidth - grid.origin.x,
                y: point.y * pageHeight / documentHeight - grid.origin.y
            )
        }
        let start = local(first.location)
        let end = local(last.location)
        let horizontal = abs(end.x - start.x) >= abs(end.y - start.y)
        let fixed = round((horizontal ? start.y : start.x) / grid.spacing) * grid.spacing
        let snapped = points.map { point -> PKStrokePoint in
            let value = local(point.location)
            let localLocation = CGPoint(
                x: horizontal ? value.x : fixed,
                y: horizontal ? fixed : value.y
            )
            let location = viewPoint(
                CGPoint(
                    x: localLocation.x * cosAngle - localLocation.y * sinAngle + center.x,
                    y: localLocation.x * sinAngle + localLocation.y * cosAngle + center.y
                )
            )
            return PKStrokePoint(
                location: location,
                timeOffset: point.timeOffset,
                size: point.size,
                opacity: point.opacity,
                force: point.force,
                azimuth: point.azimuth,
                altitude: point.altitude
            )
        }
        return PKStroke(
            ink: stroke.ink,
            path: PKStrokePath(controlPoints: snapped, creationDate: stroke.path.creationDate),
            transform: stroke.transform,
            mask: stroke.mask
        )
    }
}

@MainActor
final class GridStrokeInputView: UIView {
    var grid: DrawingGridSettings = .off {
        didSet { isUserInteractionEnabled = grid.enabled }
    }
    var inkColor: UIColor = .label
    var inkWidth: CGFloat = 4
    var onStroke: (([PKStrokePoint]) -> Void)?

    private let liveLayer = CAShapeLayer()
    private var rawLocations: [CGPoint] = []
    private var samples: [PKStrokePoint] = []
    private var axis: Axis?
    private var startedAt: TimeInterval = 0

    private enum Axis { case horizontal, vertical }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = false
        backgroundColor = .clear
        liveLayer.fillColor = UIColor.clear.cgColor
        liveLayer.lineCap = .round
        liveLayer.lineJoin = .round
        layer.addSublayer(liveLayer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, accepts(touch) else { return }
        startedAt = touch.timestamp
        axis = nil
        rawLocations = [touch.location(in: self)]
        samples = [strokePoint(for: touch, location: rawLocations[0])]
        renderLivePath()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, accepts(touch), !rawLocations.isEmpty else { return }
        let touchesToUse = event?.coalescedTouches(for: touch) ?? [touch]
        for value in touchesToUse {
            rawLocations.append(value.location(in: self))
            if axis == nil,
               let first = rawLocations.first,
               hypot(value.location(in: self).x - first.x, value.location(in: self).y - first.y) >= 8 {
                axis = preferredAxis(from: first, to: value.location(in: self))
            }
            rebuildSamples(using: value)
        }
        renderLivePath()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        if let touch = touches.first, accepts(touch) {
            rawLocations.append(touch.location(in: self))
            if axis == nil, let first = rawLocations.first {
                axis = preferredAxis(from: first, to: touch.location(in: self))
            }
            rebuildSamples(using: touch)
        }
        let completed = samples
        clearLivePath()
        if !completed.isEmpty { onStroke?(completed) }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        clearLivePath()
    }

    private func accepts(_ touch: UITouch) -> Bool {
        touch.type == .pencil || touch.type == .direct
    }

    private func preferredAxis(from start: CGPoint, to end: CGPoint) -> Axis {
        let angle = grid.rotationDegrees * .pi / 180
        let documentStart = documentPoint(start)
        let documentEnd = documentPoint(end)
        let dx = documentEnd.x - documentStart.x
        let dy = documentEnd.y - documentStart.y
        let localX = dx * cos(angle) + dy * sin(angle)
        let localY = -dx * sin(angle) + dy * cos(angle)
        return abs(localX) >= abs(localY) ? .horizontal : .vertical
    }

    private func snapped(_ point: CGPoint, start: CGPoint) -> CGPoint {
        guard let axis else { return point }
        let angle = grid.rotationDegrees * .pi / 180
        let cosAngle = cos(angle)
        let sinAngle = sin(angle)
        let center = CGPoint(
            x: grid.documentSize.width / 2,
            y: grid.documentSize.height / 2
        )
        func local(_ value: CGPoint) -> CGPoint {
            let document = documentPoint(value)
            let centered = CGPoint(x: document.x - center.x, y: document.y - center.y)
            return CGPoint(
                x: centered.x * cosAngle + centered.y * sinAngle,
                y: -centered.x * sinAngle + centered.y * cosAngle
            )
        }
        let localStart = local(start)
        let localPoint = local(point)
        let fixedValue = axis == .horizontal ? localStart.y : localStart.x
        let fixed = round(fixedValue / grid.spacing) * grid.spacing
        let result = CGPoint(
            x: axis == .horizontal ? localPoint.x : fixed,
            y: axis == .horizontal ? fixed : localPoint.y
        )
        return viewPoint(
            CGPoint(
                x: result.x * cosAngle - result.y * sinAngle + center.x,
                y: result.x * sinAngle + result.y * cosAngle + center.y
            )
        )
    }

    private func documentPoint(_ point: CGPoint) -> CGPoint {
        let pageWidth = max(grid.pageSize.width, 1)
        let pageHeight = max(grid.pageSize.height, 1)
        let documentWidth = max(grid.documentSize.width, 1)
        let documentHeight = max(grid.documentSize.height, 1)
        return CGPoint(
            x: (point.x + grid.origin.x) * documentWidth / pageWidth,
            y: (point.y + grid.origin.y) * documentHeight / pageHeight
        )
    }

    private func viewPoint(_ point: CGPoint) -> CGPoint {
        let pageWidth = max(grid.pageSize.width, 1)
        let pageHeight = max(grid.pageSize.height, 1)
        let documentWidth = max(grid.documentSize.width, 1)
        let documentHeight = max(grid.documentSize.height, 1)
        return CGPoint(
            x: point.x * pageWidth / documentWidth - grid.origin.x,
            y: point.y * pageHeight / documentHeight - grid.origin.y
        )
    }

    private func rebuildSamples(using touch: UITouch) {
        guard let start = rawLocations.first else { return }
        let force = touch.maximumPossibleForce > 0
            ? touch.force / touch.maximumPossibleForce
            : 0.5
        samples = rawLocations.enumerated().map { index, location in
            PKStrokePoint(
                location: snapped(location, start: start),
                timeOffset: TimeInterval(index) / 120,
                size: CGSize(width: inkWidth, height: inkWidth),
                opacity: 1,
                force: force,
                azimuth: touch.azimuthAngle(in: self),
                altitude: touch.altitudeAngle
            )
        }
    }

    private func strokePoint(for touch: UITouch, location: CGPoint) -> PKStrokePoint {
        let force = touch.maximumPossibleForce > 0
            ? touch.force / touch.maximumPossibleForce
            : 0.5
        return PKStrokePoint(
            location: location,
            timeOffset: touch.timestamp - startedAt,
            size: CGSize(width: inkWidth, height: inkWidth),
            opacity: 1,
            force: force,
            azimuth: touch.azimuthAngle(in: self),
            altitude: touch.altitudeAngle
        )
    }

    private func renderLivePath() {
        let path = UIBezierPath()
        for (index, sample) in samples.enumerated() {
            index == 0 ? path.move(to: sample.location) : path.addLine(to: sample.location)
        }
        liveLayer.strokeColor = inkColor.cgColor
        liveLayer.lineWidth = inkWidth
        liveLayer.path = path.cgPath
    }

    private func clearLivePath() {
        rawLocations = []
        samples = []
        axis = nil
        liveLayer.path = nil
    }
}
#endif
