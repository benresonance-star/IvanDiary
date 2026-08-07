import PencilKit
import UIKit

@MainActor
public final class NativeDrawingOverlay: UIView, PKCanvasViewDelegate {
    public private(set) var documentID: String?
    public private(set) var isPresented = false

    private let canvasView = PKCanvasView()
    private let store: any PencilDrawingStore
    private var color: UIColor = .label
    private var width: CGFloat = 4
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
        addSubview(canvasView)
        NSLayoutConstraint.activate([
            canvasView.leadingAnchor.constraint(equalTo: leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: trailingAnchor),
            canvasView.topAnchor.constraint(equalTo: topAnchor),
            canvasView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
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
        tool: NativeDrawingTool,
        frame: CGRect,
        legacyInk: LegacyInkDocument? = nil
    ) throws {
        pendingSave?.cancel()
        let previousDocumentID = self.documentID
        if isPresented, previousDocumentID != documentID {
            _ = try? saveDrawing()
        }
        self.documentID = documentID
        self.color = color
        self.width = width
        self.frame = frame
        layoutIfNeeded()
        apply(tool: tool)
        if superview !== host {
            removeFromSuperview()
            host.addSubview(self)
        }
        host.bringSubviewToFront(self)
        if !isPresented || previousDocumentID != documentID {
            try loadDrawing(documentID: documentID)
        }
        if let legacyInk, !legacyInk.strokes.isEmpty {
            let canvasSize = bounds.isEmpty ? frame.size : bounds.size
            canvasView.drawing = LegacyInkImport.merging(
                canvasView.drawing,
                with: legacyInk,
                canvasSize: canvasSize
            )
            _ = try saveDrawing()
        }
        isPresented = true
        isHidden = false
        isUserInteractionEnabled = loadError == nil
    }

    public func update(
        color: UIColor?,
        width: CGFloat?,
        tool: NativeDrawingTool?,
        frame: CGRect?
    ) {
        if let color {
            self.color = color
        }
        if let width {
            self.width = width
        }
        if let frame {
            self.frame = frame
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

    public func undo() {
        canvasView.undoManager?.undo()
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

    private func apply(tool: NativeDrawingTool) {
        switch tool {
        case .pen:
            canvasView.tool = PKInkingTool(
                .pen,
                color: PencilInkColor.forLightPaper(color),
                width: width
            )
        case .eraser:
            canvasView.tool = PKEraserTool(.vector)
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
