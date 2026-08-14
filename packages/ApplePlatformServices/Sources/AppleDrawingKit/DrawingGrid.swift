#if canImport(UIKit)
import CoreGraphics
import PencilKit
import UIKit

public struct DrawingGridSettings: Sendable, Equatable {
    public let enabled: Bool
    public let spacing: CGFloat
    public let rotationDegrees: CGFloat
    public let origin: CGPoint
    public let pageSize: CGSize

    public init(
        enabled: Bool,
        spacing: CGFloat,
        rotationDegrees: CGFloat,
        origin: CGPoint = .zero,
        pageSize: CGSize = CGSize(width: 1200, height: 820)
    ) {
        self.enabled = enabled
        self.spacing = spacing
        self.rotationDegrees = rotationDegrees
        self.origin = origin
        self.pageSize = pageSize
    }

    public static let off = DrawingGridSettings(
        enabled: false,
        spacing: 60,
        rotationDegrees: 0,
        origin: .zero,
        pageSize: CGSize(width: 1200, height: 820)
    )
}

enum DrawingGridSnap {
    static func stroke(_ stroke: PKStroke, to grid: DrawingGridSettings) -> PKStroke {
        guard grid.enabled, stroke.path.count > 1 else { return stroke }
        let points = (0..<stroke.path.count).map { stroke.path[$0] }
        guard let first = points.first, let last = points.last else { return stroke }
        let angle = grid.rotationDegrees * .pi / 180
        let cosAngle = cos(angle)
        let sinAngle = sin(angle)
        func local(_ point: CGPoint) -> CGPoint {
            CGPoint(
                x: point.x * cosAngle + point.y * sinAngle,
                y: -point.x * sinAngle + point.y * cosAngle
            )
        }
        let start = local(CGPoint(x: first.location.x + grid.origin.x, y: first.location.y + grid.origin.y))
        let end = local(CGPoint(x: last.location.x + grid.origin.x, y: last.location.y + grid.origin.y))
        let horizontal = abs(end.x - start.x) >= abs(end.y - start.y)
        let fixed = round((horizontal ? start.y : start.x) / grid.spacing) * grid.spacing
        let snapped = points.map { point -> PKStrokePoint in
            let value = local(CGPoint(x: point.location.x + grid.origin.x, y: point.location.y + grid.origin.y))
            let localLocation = CGPoint(
                x: horizontal ? value.x : fixed,
                y: horizontal ? fixed : value.y
            )
            let location = CGPoint(
                x: localLocation.x * cosAngle - localLocation.y * sinAngle - grid.origin.x,
                y: localLocation.x * sinAngle + localLocation.y * cosAngle - grid.origin.y
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
        func local(_ value: CGPoint) -> CGPoint {
            CGPoint(
                x: value.x * cosAngle + value.y * sinAngle,
                y: -value.x * sinAngle + value.y * cosAngle
            )
        }
        let localStart = local(documentPoint(start))
        let localPoint = local(documentPoint(point))
        let fixedValue = axis == .horizontal ? localStart.y : localStart.x
        let fixed = round(fixedValue / grid.spacing) * grid.spacing
        let result = CGPoint(
            x: axis == .horizontal ? localPoint.x : fixed,
            y: axis == .horizontal ? fixed : localPoint.y
        )
        return viewPoint(
            CGPoint(
                x: result.x * cosAngle - result.y * sinAngle,
                y: result.x * sinAngle + result.y * cosAngle
            )
        )
    }

    private func documentPoint(_ point: CGPoint) -> CGPoint {
        let pageWidth = max(grid.pageSize.width, 1)
        let pageHeight = max(grid.pageSize.height, 1)
        return CGPoint(
            x: (point.x + grid.origin.x) * 1200 / pageWidth,
            y: (point.y + grid.origin.y) * 820 / pageHeight
        )
    }

    private func viewPoint(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: point.x * max(grid.pageSize.width, 1) / 1200 - grid.origin.x,
            y: point.y * max(grid.pageSize.height, 1) / 820 - grid.origin.y
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
