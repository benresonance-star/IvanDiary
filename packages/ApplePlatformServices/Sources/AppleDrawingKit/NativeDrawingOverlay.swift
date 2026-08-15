#if canImport(UIKit)
import PencilKit
import UIKit

@MainActor
public final class NativeDrawingOverlay: UIView, PKCanvasViewDelegate {
    public private(set) var documentID: String?
    public private(set) var isPresented = false
    public var onDrawingChanged: ((String) -> Void)?

    private let canvasView = PKCanvasView()
    private let gridGuideView = DrawingGridGuideView()
    private let gridInputView = GridStrokeInputView()
    private let store: any PencilDrawingStore
    private lazy var twoFingerUndoRecognizer: UITapGestureRecognizer = {
        let recognizer = UITapGestureRecognizer(
            target: self,
            action: #selector(handleTwoFingerUndo(_:))
        )
        recognizer.numberOfTouchesRequired = 2
        recognizer.cancelsTouchesInView = true
        recognizer.allowedTouchTypes = [
            NSNumber(value: UITouch.TouchType.direct.rawValue)
        ]
        return recognizer
    }()
    private var color: UIColor = .label
    private var width: CGFloat = 4
    private var grid: DrawingGridSettings = .off
    private var selectedTool: NativeDrawingTool = .pen
    private var selectedNib: NativeDrawingNib = .pen
    private var fingerDrawing = true
    private var loadError: Error?
    private var pendingSave: Task<Void, Never>?
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
        canvasView.addGestureRecognizer(twoFingerUndoRecognizer)
        canvasView.drawingGestureRecognizer.require(
            toFail: twoFingerUndoRecognizer
        )
        gridGuideView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(gridGuideView)
        addSubview(canvasView)
        gridInputView.translatesAutoresizingMaskIntoConstraints = false
        gridInputView.isUserInteractionEnabled = false
        addSubview(gridInputView)
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
            gridInputView.bottomAnchor.constraint(equalTo: bottomAnchor)
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

    public func present(
        in host: UIView,
        documentID: String,
        color: UIColor,
        width: CGFloat,
        nib: NativeDrawingNib = .pen,
        fingerDrawing: Bool = true,
        tool: NativeDrawingTool,
        grid: DrawingGridSettings = .off,
        frame: CGRect,
        clipToCircle: Bool = false,
        legacyInk: LegacyInkDocument? = nil
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
        self.fingerDrawing = fingerDrawing
        canvasView.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
        self.grid = grid
        updateGridInput()
        self.frame = frame
        layoutIfNeeded()
        applyClipping(circle: clipToCircle)
        apply(tool: tool)
        if !isPresented || previousDocumentID != documentID {
            try loadDrawing(documentID: documentID)
        }
        var importedLegacyStrokes = false
        if let legacyInk,
           !legacyInk.strokes.isEmpty,
           canvasView.drawing.strokes.isEmpty {
            let canvasSize = bounds.isEmpty ? frame.size : bounds.size
            canvasView.drawing = LegacyInkImport.merging(
                canvasView.drawing,
                with: legacyInk,
                canvasSize: canvasSize
            )
            _ = try saveDrawing()
            importedLegacyStrokes = true
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
        fingerDrawing: Bool? = nil,
        tool: NativeDrawingTool?,
        grid: DrawingGridSettings? = nil,
        frame: CGRect?,
        clipToCircle: Bool? = nil
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
        if let fingerDrawing {
            self.fingerDrawing = fingerDrawing
            canvasView.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
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
        if let tool {
            apply(tool: tool)
        } else if canvasView.tool is PKInkingTool {
            apply(tool: .pen)
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

    private func dismissToolPicker() {
        canvasView.resignFirstResponder()
        PKToolPicker().setVisible(false, forFirstResponder: canvasView)
        if let window = window, let picker = PKToolPicker.shared(for: window) {
            picker.setVisible(false, forFirstResponder: canvasView)
        }
    }

    public func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        pendingSave?.cancel()
        pendingSave = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled, let self else {
                return
            }
            self.saveAndRememberFailure()
        }
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
        gridGuideView.grid = grid
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
        canvasView.drawing = PKDrawing(strokes: canvasView.drawing.strokes + [stroke])
        if let documentID { onDrawingChanged?(documentID) }
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
