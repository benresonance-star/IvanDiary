#if canImport(UIKit)
import PencilKit
import UIKit

public struct NativeOverlayShape: Sendable {
    public enum Kind: String, Sendable { case circle, polygon, freeform }
    public let kind: Kind
    public let frame: CGRect
    public let rotationDegrees: CGFloat
    public let points: [CGPoint]
    public let fillColorHex: String?
    public let outlineColorHex: String?
    public let outlineWidth: CGFloat

    public init(kind: Kind, frame: CGRect, rotationDegrees: CGFloat, points: [CGPoint], fillColorHex: String?, outlineColorHex: String?, outlineWidth: CGFloat) {
        self.kind = kind
        self.frame = frame
        self.rotationDegrees = rotationDegrees
        self.points = points
        self.fillColorHex = fillColorHex
        self.outlineColorHex = outlineColorHex
        self.outlineWidth = outlineWidth
    }
}

@MainActor
public final class NativeDrawingOverlay: UIView, PKCanvasViewDelegate, UIGestureRecognizerDelegate {
    public private(set) var documentID: String?
    public private(set) var isPresented = false
    public private(set) var passthroughRects: [CGRect] = []
    public private(set) var visualHoleRects: [CGRect] = []
    public var onDrawingChanged: ((String) -> Void)?
    public var onCanvasTapped: ((CGPoint) -> Void)?
    public var onCanvasLongPressed: ((CGPoint) -> Void)?

    private static let contentInteractionTouchTypes: [NSNumber] = [
        (UITouch.TouchType.direct, NativeDrawingTouchKind.direct),
        (UITouch.TouchType.pencil, NativeDrawingTouchKind.pencil)
    ].compactMap { touchType, touchKind in
        NativeDrawingGesturePolicy.permitsContentInteraction(for: touchKind)
            ? NSNumber(value: touchType.rawValue)
            : nil
    }
    private let canvasView = PKCanvasView()
    private let gridGuideView = DrawingGridGuideView()
    private let gridInputView = GridStrokeInputView()
    private let shapeOverlayView = UIView()
    private let scriptureGoldOverlayView = ScriptureGoldOverlayView()
    private let store: any PencilDrawingStore
    private lazy var twoFingerUndoRecognizer: UITapGestureRecognizer = {
        let recognizer = UITapGestureRecognizer(
            target: self,
            action: #selector(handleTwoFingerUndo(_:))
        )
        recognizer.numberOfTouchesRequired = 2
        recognizer.cancelsTouchesInView = true
        recognizer.allowedTouchTypes = Self.contentInteractionTouchTypes
        return recognizer
    }()
    private lazy var oneFingerSelectionRecognizer: UITapGestureRecognizer = {
        let recognizer = UITapGestureRecognizer(
            target: self,
            action: #selector(handleOneFingerSelection(_:))
        )
        recognizer.numberOfTouchesRequired = 1
        recognizer.cancelsTouchesInView = false
        recognizer.allowedTouchTypes = Self.contentInteractionTouchTypes
        recognizer.delegate = self
        return recognizer
    }()
    private lazy var oneFingerLongPressRecognizer: UILongPressGestureRecognizer = {
        let recognizer = UILongPressGestureRecognizer(
            target: self,
            action: #selector(handleOneFingerLongPress(_:))
        )
        recognizer.minimumPressDuration = 0.65
        recognizer.cancelsTouchesInView = false
        recognizer.allowedTouchTypes = Self.contentInteractionTouchTypes
        recognizer.delegate = self
        return recognizer
    }()
    private var color: UIColor = .label
    private var width: CGFloat = 4
    private var grid: DrawingGridSettings = .off
    private var selectedTool: NativeDrawingTool = .pen
    private var selectedNib: NativeDrawingNib = .pen
    private var selectedMaterial: NativeDrawingMaterial = .solid
    private var selectedGoldFinish: NativeGoldFinish = .raised
    private var fingerDrawing = true
    private var loadError: Error?
    private var pendingSave: Task<Void, Never>?
    private var pendingGoldRefresh: Task<Void, Never>?
    private var persistenceError: Error?

    private enum DrawingPersistenceError: Error {
        case previewUnavailable
        case notPresented
        case loadFailed
    }

    public init(
        store: any PencilDrawingStore = ApplicationSupportPencilDrawingStore()
    ) {
        self.store = store
        super.init(frame: .zero)
        isOpaque = false
        backgroundColor = .clear
        // PencilKit inverts ink in dark mode (black → white). Journal paper is
        // always light, so keep the canvas in light appearance permanently.
        overrideUserInterfaceStyle = .light
        canvasView.overrideUserInterfaceStyle = .light
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.backgroundColor = .clear
        canvasView.isOpaque = false
        canvasView.drawingPolicy = .anyInput
        canvasView.delegate = self
        addGestureRecognizer(twoFingerUndoRecognizer)
        canvasView.addGestureRecognizer(oneFingerSelectionRecognizer)
        canvasView.addGestureRecognizer(oneFingerLongPressRecognizer)
        oneFingerSelectionRecognizer.require(
            toFail: oneFingerLongPressRecognizer
        )
        canvasView.drawingGestureRecognizer.require(
            toFail: twoFingerUndoRecognizer
        )
        if NativeDrawingGesturePolicy.drawingWaitsForContentInteraction {
            canvasView.drawingGestureRecognizer.require(
                toFail: oneFingerSelectionRecognizer
            )
            canvasView.drawingGestureRecognizer.require(
                toFail: oneFingerLongPressRecognizer
            )
        }
        gridGuideView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(gridGuideView)
        addSubview(canvasView)
        gridInputView.translatesAutoresizingMaskIntoConstraints = false
        gridInputView.isUserInteractionEnabled = false
        addSubview(gridInputView)
        shapeOverlayView.translatesAutoresizingMaskIntoConstraints = false
        shapeOverlayView.isUserInteractionEnabled = false
        shapeOverlayView.backgroundColor = .clear
        addSubview(shapeOverlayView)
        scriptureGoldOverlayView.translatesAutoresizingMaskIntoConstraints = false
        scriptureGoldOverlayView.isUserInteractionEnabled = false
        addSubview(scriptureGoldOverlayView)
        NSLayoutConstraint.activate([
            gridGuideView.leadingAnchor.constraint(equalTo: leadingAnchor),
            gridGuideView.trailingAnchor.constraint(equalTo: trailingAnchor),
            gridGuideView.topAnchor.constraint(equalTo: topAnchor),
            gridGuideView.bottomAnchor.constraint(equalTo: bottomAnchor),
            canvasView.leadingAnchor.constraint(equalTo: leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: trailingAnchor),
            canvasView.topAnchor.constraint(equalTo: topAnchor),
            canvasView.bottomAnchor.constraint(equalTo: bottomAnchor),
            gridInputView.leadingAnchor.constraint(equalTo: leadingAnchor),
            gridInputView.trailingAnchor.constraint(equalTo: trailingAnchor),
            gridInputView.topAnchor.constraint(equalTo: topAnchor),
            gridInputView.bottomAnchor.constraint(equalTo: bottomAnchor),
            shapeOverlayView.leadingAnchor.constraint(equalTo: leadingAnchor),
            shapeOverlayView.trailingAnchor.constraint(equalTo: trailingAnchor),
            shapeOverlayView.topAnchor.constraint(equalTo: topAnchor),
            shapeOverlayView.bottomAnchor.constraint(equalTo: bottomAnchor),
            scriptureGoldOverlayView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scriptureGoldOverlayView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scriptureGoldOverlayView.topAnchor.constraint(equalTo: topAnchor),
            scriptureGoldOverlayView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        gridInputView.onStroke = { [weak self] points in
            self?.commitGridStroke(points)
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(saveForBackground(_:)),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    public override func hitTest(
        _ point: CGPoint,
        with event: UIEvent?
    ) -> UIView? {
        if DrawingInputPassthroughPolicy.passesThrough(
            point: point,
            regions: passthroughRects
        ) {
            return nil
        }
        return super.hitTest(point, with: event)
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        applyVisualHoles()
    }

    public func present(
        in host: UIView,
        documentID: String,
        color: UIColor,
        width: CGFloat,
        nib: NativeDrawingNib = .pen,
        material: NativeDrawingMaterial = .solid,
        goldFinish: NativeGoldFinish = .raised,
        fingerDrawing: Bool = true,
        twoFingerUndo: Bool = true,
        tool: NativeDrawingTool,
        grid: DrawingGridSettings = .off,
        frame: CGRect,
        clipToCircle: Bool = false,
        legacyInk: LegacyInkDocument? = nil,
        overlayShapes: [NativeOverlayShape] = [],
        passthroughRects: [CGRect] = [],
        visualHoleRects: [CGRect] = []
    ) throws -> Bool {
        pendingSave?.cancel()
        let previousDocumentID = self.documentID
        if isPresented, previousDocumentID != documentID {
            _ = try saveDrawing()
        }
        self.documentID = documentID
        self.color = color
        self.width = width
        self.selectedNib = nib
        self.selectedMaterial = material
        self.selectedGoldFinish = goldFinish
        self.fingerDrawing = fingerDrawing
        twoFingerUndoRecognizer.isEnabled = twoFingerUndo
        canvasView.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
        self.grid = grid
        self.passthroughRects = passthroughRects
        self.visualHoleRects = visualHoleRects
        updateGridInput()
        self.frame = frame
        layoutIfNeeded()
        applyClipping(circle: clipToCircle)
        applyVisualHoles()
        apply(tool: tool)
        renderOverlayShapes(overlayShapes, grid: grid)
        // Hiding the overlay already persists the current drawing. Reopening
        // the same document for a tool/settings change can reuse the in-memory
        // PKDrawing instead of synchronously decoding it from disk again.
        // A different document or a failed load must still perform a reload.
        if previousDocumentID != documentID || loadError != nil {
            try loadDrawing(documentID: documentID)
        }
        refreshScriptureGoldPresentation()
        var importedLegacyStrokes = false
        if let legacyInk,
           !legacyInk.strokes.isEmpty {
            let canvasSize = bounds.isEmpty ? frame.size : bounds.size
            let missingStrokes = LegacyInkImport.missingStrokes(
                from: legacyInk,
                in: canvasView.drawing,
                canvasSize: canvasSize
            )
            let importableStrokeCount = LegacyInkImport.strokes(
                from: legacyInk,
                canvasSize: canvasSize
            ).count
            if importableStrokeCount > 0 {
                if !missingStrokes.isEmpty {
                    canvasView.drawing.strokes.append(
                        contentsOf: missingStrokes
                    )
                    _ = try saveDrawing()
                }
                importedLegacyStrokes = true
            }
        }
        if superview !== host {
            removeFromSuperview()
            host.addSubview(self)
        }
        host.bringSubviewToFront(self)
        isPresented = true
        isHidden = false
        isUserInteractionEnabled = loadError == nil
        return importedLegacyStrokes
    }

    public func update(
        color: UIColor?,
        width: CGFloat?,
        nib: NativeDrawingNib? = nil,
        material: NativeDrawingMaterial? = nil,
        goldFinish: NativeGoldFinish? = nil,
        fingerDrawing: Bool? = nil,
        twoFingerUndo: Bool? = nil,
        tool: NativeDrawingTool?,
        grid: DrawingGridSettings? = nil,
        frame: CGRect?,
        clipToCircle: Bool? = nil,
        overlayShapes: [NativeOverlayShape]? = nil,
        passthroughRects: [CGRect]? = nil,
        visualHoleRects: [CGRect]? = nil
    ) {
        if let color {
            self.color = color
        }
        if let width {
            self.width = width
        }
        if let nib {
            self.selectedNib = nib
        }
        if let material {
            self.selectedMaterial = material
        }
        if let goldFinish {
            self.selectedGoldFinish = goldFinish
        }
        if let fingerDrawing {
            self.fingerDrawing = fingerDrawing
            canvasView.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
        }
        if let twoFingerUndo {
            twoFingerUndoRecognizer.isEnabled = twoFingerUndo
        }
        if let grid {
            self.grid = grid
            updateGridInput()
        }
        if let frame {
            self.frame = frame
            layoutIfNeeded()
        }
        if let clipToCircle {
            applyClipping(circle: clipToCircle)
        }
        if let overlayShapes {
            renderOverlayShapes(overlayShapes, grid: self.grid)
        }
        if let passthroughRects {
            self.passthroughRects = passthroughRects
        }
        if let visualHoleRects {
            self.visualHoleRects = visualHoleRects
            applyVisualHoles()
        }
        if let tool {
            apply(tool: tool)
        } else if canvasView.tool is PKInkingTool {
            apply(tool: .pen)
        }
        refreshScriptureGoldPresentation()
    }

    private func renderOverlayShapes(_ shapes: [NativeOverlayShape], grid: DrawingGridSettings) {
        shapeOverlayView.layer.sublayers?.forEach { $0.removeFromSuperlayer() }
        let pageWidth = max(grid.pageSize.width, 1)
        let pageHeight = max(grid.pageSize.height, 1)
        for shape in shapes {
            let layer = CAShapeLayer()
            let frame = CGRect(
                x: shape.frame.minX * pageWidth - grid.origin.x,
                y: shape.frame.minY * pageHeight - grid.origin.y,
                width: shape.frame.width * pageWidth,
                height: shape.frame.height * pageHeight
            )
            layer.frame = frame
            let path = UIBezierPath()
            if shape.kind == .circle {
                path.append(UIBezierPath(ovalIn: layer.bounds.insetBy(dx: layer.bounds.width * 0.04, dy: layer.bounds.height * 0.04)))
            } else {
                let points = shape.points.map { CGPoint(x: $0.x * layer.bounds.width, y: $0.y * layer.bounds.height) }
                guard let first = points.first else { continue }
                path.move(to: first)
                if shape.kind == .freeform && points.count >= 3 {
                    for index in points.indices {
                        let previous = points[(index - 1 + points.count) % points.count]
                        let current = points[index]
                        let next = points[(index + 1) % points.count]
                        let after = points[(index + 2) % points.count]
                        path.addCurve(
                            to: next,
                            controlPoint1: CGPoint(x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6),
                            controlPoint2: CGPoint(x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6)
                        )
                    }
                } else {
                    points.dropFirst().forEach { path.addLine(to: $0) }
                }
                path.close()
            }
            layer.path = path.cgPath
            layer.fillColor = shape.fillColorHex.map { PencilInkColor.fromHexRGB($0).cgColor } ?? UIColor.clear.cgColor
            layer.strokeColor = shape.outlineColorHex.map { PencilInkColor.fromHexRGB($0).cgColor } ?? UIColor.clear.cgColor
            layer.lineWidth = shape.outlineColorHex == nil ? 0 : shape.outlineWidth
            layer.lineJoin = .round
            layer.setAffineTransform(CGAffineTransform(rotationAngle: shape.rotationDegrees * .pi / 180))
            shapeOverlayView.layer.addSublayer(layer)
        }
    }

    public func hide(save: Bool) throws -> PencilDrawingPreview? {
        pendingSave?.cancel()
        guard isPresented else {
            return nil
        }
        var preview: PencilDrawingPreview?
        if save {
            if loadError != nil {
                throw DrawingPersistenceError.loadFailed
            }
            preview = try saveDrawing()
        }
        isUserInteractionEnabled = false
        dismissToolPicker()
        isHidden = true
        isPresented = false
        return preview
    }

    /// Persist the current canvas without dismissing the overlay.
    public func flushSave() throws -> PencilDrawingPreview? {
        pendingSave?.cancel()
        guard isPresented else {
            return nil
        }
        if loadError != nil {
            throw DrawingPersistenceError.loadFailed
        }
        return try saveDrawing()
    }

    public func clearDrawing() throws -> PencilDrawingPreview? {
        pendingSave?.cancel()
        guard isPresented else {
            return nil
        }
        if loadError != nil {
            throw DrawingPersistenceError.loadFailed
        }
        canvasView.drawing = PKDrawing()
        if let documentID { onDrawingChanged?(documentID) }
        return try saveDrawing()
    }

    public func removeDrawing(documentID requestedDocumentID: String) throws {
        pendingSave?.cancel()
        if isPresented, documentID == requestedDocumentID {
            _ = try hide(save: false)
            canvasView.drawing = PKDrawing()
            documentID = nil
        }
        try store.remove(documentID: requestedDocumentID)
    }

    public func undo() {
        canvasView.undoManager?.undo()
    }

    public func redo() {
        canvasView.undoManager?.redo()
    }

    @objc
    private func handleOneFingerSelection(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended else {
            return
        }
        onCanvasTapped?(recognizer.location(in: self))
    }

    @objc
    private func handleOneFingerLongPress(
        _ recognizer: UILongPressGestureRecognizer
    ) {
        guard recognizer.state == .began else {
            return
        }
        onCanvasLongPressed?(recognizer.location(in: self))
    }

    @objc
    private func handleTwoFingerUndo(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended else {
            return
        }
        undo()
    }

    private func applyClipping(circle: Bool) {
        clipsToBounds = circle
        layer.cornerRadius = circle ? min(bounds.width, bounds.height) / 2 : 0
    }

    private func applyVisualHoles() {
        let bounds = canvasView.bounds
        if visualHoleRects.isEmpty || bounds.isEmpty {
            canvasView.layer.mask = nil
            scriptureGoldOverlayView.layer.mask = nil
            return
        }
        let path = DrawingOverlayMaskPolicy.maskPath(
            bounds: bounds,
            holes: visualHoleRects
        )
        canvasView.layer.mask = Self.visualHoleMask(path: path)
        scriptureGoldOverlayView.layer.mask = Self.visualHoleMask(path: path)
    }

    private static func visualHoleMask(path: CGPath) -> CAShapeLayer {
        let mask = CAShapeLayer()
        mask.fillRule = DrawingOverlayMaskPolicy.usesEvenOddFill
            ? .evenOdd
            : .nonZero
        mask.path = path
        return mask
    }

    private func dismissToolPicker() {
        canvasView.resignFirstResponder()
        PKToolPicker().setVisible(false, forFirstResponder: canvasView)
        if let window = window, let picker = PKToolPicker.shared(for: window) {
            picker.setVisible(false, forFirstResponder: canvasView)
        }
    }

    public func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        scheduleScriptureGoldRefresh()
        pendingSave?.cancel()
        pendingSave = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled, let self else {
                return
            }
            self.saveAndRememberFailure()
        }
    }

    private func scheduleScriptureGoldRefresh() {
        guard pendingGoldRefresh == nil else { return }
        pendingGoldRefresh = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 80_000_000)
            guard let self, !Task.isCancelled else { return }
            self.pendingGoldRefresh = nil
            self.refreshScriptureGoldPresentation()
        }
    }

    private func refreshScriptureGoldPresentation() {
        scriptureGoldOverlayView.setDrawing(
            canvasView.drawing,
            canvasSize: canvasView.bounds.size,
            active: selectedMaterial == .scriptureGold,
            finish: selectedGoldFinish
        )
    }

    public func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
        if let documentID { onDrawingChanged?(documentID) }
    }

    private func apply(tool: NativeDrawingTool) {
        selectedTool = tool
        updateGridInput()
        switch tool {
        case .pen:
            canvasView.tool = PKInkingTool(
                selectedNib.inkType,
                color: PencilInkColor.forLightPaper(color),
                width: width
            )
        case .eraser:
            canvasView.tool = PKEraserTool(.vector)
        }
    }

    private func updateGridInput() {
        // The web grid is deliberately rendered below page objects such as
        // voice controls and photos. A native guide would sit above the web
        // view regardless of its subview order, so native code handles only
        // snapping while the web layer remains the single visible guide.
        gridGuideView.grid = .off
        gridInputView.grid = DrawingGridSettings(
            enabled: grid.enabled && grid.snapToGrid && selectedTool == .pen,
            snapToGrid: grid.snapToGrid,
            spacing: grid.spacing,
            rotationDegrees: grid.rotationDegrees,
            origin: grid.origin,
            pageSize: grid.pageSize,
            documentSize: grid.documentSize,
            type: grid.type,
            colorHex: grid.colorHex
        )
        gridInputView.inkColor = PencilInkColor.forLightPaper(color)
        gridInputView.inkWidth = width
    }

    private func commitGridStroke(_ points: [PKStrokePoint]) {
        guard !points.isEmpty else { return }
        let stroke = PKStroke(
            ink: PKInk(selectedNib.inkType, color: PencilInkColor.forLightPaper(color)),
            path: PKStrokePath(controlPoints: points, creationDate: Date())
        )
        let previousDrawing = canvasView.drawing
        let nextDrawing = PKDrawing(strokes: previousDrawing.strokes + [stroke])
        replaceGridDrawing(nextDrawing, undoingTo: previousDrawing)
        if let documentID { onDrawingChanged?(documentID) }
    }

    private func replaceGridDrawing(_ drawing: PKDrawing, undoingTo previous: PKDrawing) {
        canvasView.drawing = drawing
        canvasView.undoManager?.registerUndo(withTarget: self) { overlay in
            overlay.replaceGridDrawing(previous, undoingTo: drawing)
            if let documentID = overlay.documentID {
                overlay.onDrawingChanged?(documentID)
            }
        }
    }

    private func loadDrawing(documentID: String) throws {
        loadError = nil
        do {
            guard let data = try store.load(documentID: documentID) else {
                canvasView.drawing = PKDrawing()
                return
            }
            canvasView.drawing = try PKDrawing(data: data)
        } catch {
            loadError = error
            canvasView.drawing = PKDrawing()
            canvasView.isUserInteractionEnabled = false
            throw error
        }
        canvasView.isUserInteractionEnabled = true
    }

    private func saveDrawing() throws -> PencilDrawingPreview? {
        guard let documentID else {
            throw DrawingPersistenceError.notPresented
        }
        if let loadError {
            throw loadError
        }
        if canvasView.drawing.strokes.isEmpty {
            try store.remove(documentID: documentID)
            return nil
        }
        let bounds = canvasView.bounds.isEmpty
            ? CGRect(x: 0, y: 0, width: max(frame.width, 1), height: max(frame.height, 1))
            : canvasView.bounds
        let previewImage = PencilInkColor.renderPreview(
            drawing: canvasView.drawing,
            bounds: bounds
        )
        guard let previewData = previewImage.pngData() else {
            throw DrawingPersistenceError.previewUnavailable
        }
        try store.save(
            canvasView.drawing.dataRepresentation(),
            documentID: documentID
        )
        try store.savePreview(previewData, documentID: documentID)
        guard let preview = try store.loadPreview(documentID: documentID) else {
            throw DrawingPersistenceError.previewUnavailable
        }
        return preview
    }

    private func saveAndRememberFailure() {
        do {
            _ = try saveDrawing()
            persistenceError = nil
        } catch {
            persistenceError = error
        }
    }

    @objc private func saveForBackground(_ notification: Notification) {
        pendingSave?.cancel()
        saveAndRememberFailure()
    }
}
#endif
