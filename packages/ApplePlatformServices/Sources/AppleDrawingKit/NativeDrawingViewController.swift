#if canImport(UIKit)
import PencilKit
import UIKit

public protocol PencilDrawingStore: Sendable {
    func load(documentID: String) throws -> Data?
    func save(_ data: Data, documentID: String) throws
    func loadPreview(documentID: String) throws -> PencilDrawingPreview?
    func savePreview(_ data: Data, documentID: String) throws
    func remove(documentID: String) throws
}

public struct PencilDrawingPreview: Sendable {
    public let fileURL: URL
    public let modifiedAt: Date

    public init(fileURL: URL, modifiedAt: Date) {
        self.fileURL = fileURL
        self.modifiedAt = modifiedAt
    }
}

public struct NativeDrawingResult: Sendable {
    public let saved: Bool
    public let preview: PencilDrawingPreview?

    public init(saved: Bool, preview: PencilDrawingPreview?) {
        self.saved = saved
        self.preview = preview
    }
}

public enum NativeDrawingTool: String, Sendable {
    case pen
    case eraser
}

public enum NativeDrawingNib: String, Sendable {
    case pen
    case marker
    case pencil
    case brush

    var inkType: PKInkingTool.InkType {
        switch self {
        case .pen: return .pen
        case .marker: return .marker
        case .pencil: return .pencil
        // Watercolor gives Brush a soft, layered painted edge that is
        // visibly distinct from Pencil and Marker.
        case .brush:
            if #available(iOS 17.0, *) {
                return .watercolor
            }
            return .pencil
        }
    }
}

public struct ApplicationSupportPencilDrawingStore: PencilDrawingStore {
    public init() {}

    public func load(documentID: String) throws -> Data? {
        let url = try fileURL(documentID: documentID, extension: "pkdrawing")
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        return try Data(contentsOf: url)
    }

    public func save(_ data: Data, documentID: String) throws {
        let url = try fileURL(documentID: documentID, extension: "pkdrawing")
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUnlessOpen]
        )
    }

    public func loadPreview(
        documentID: String
    ) throws -> PencilDrawingPreview? {
        let url = try fileURL(documentID: documentID, extension: "png")
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        let values = try url.resourceValues(forKeys: [.contentModificationDateKey])
        return PencilDrawingPreview(
            fileURL: url,
            modifiedAt: values.contentModificationDate ?? Date.distantPast
        )
    }

    public func savePreview(_ data: Data, documentID: String) throws {
        let url = try fileURL(documentID: documentID, extension: "png")
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUnlessOpen]
        )
    }

    public func remove(documentID: String) throws {
        for fileExtension in ["pkdrawing", "png"] {
            let url = try fileURL(documentID: documentID, extension: fileExtension)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
    }

    /// Returns a preview only when the drawing still has strokes.
    public func loadContentPreview(
        documentID: String,
        bounds: CGRect = CGRect(x: 0, y: 0, width: 1200, height: 820)
    ) throws -> PencilDrawingPreview? {
        guard let data = try load(documentID: documentID) else {
            try remove(documentID: documentID)
            return nil
        }
        let drawing = try PKDrawing(data: data)
        guard !drawing.strokes.isEmpty else {
            try remove(documentID: documentID)
            return nil
        }

        let drawingURL = try fileURL(
            documentID: documentID,
            extension: "pkdrawing"
        )
        let drawingModifiedAt = try drawingURL.resourceValues(
            forKeys: [.contentModificationDateKey]
        ).contentModificationDate ?? Date.distantPast
        if let preview = try loadPreview(documentID: documentID),
           preview.modifiedAt >= drawingModifiedAt,
           let image = UIImage(contentsOfFile: preview.fileURL.path) {
            let requestedAspect = bounds.width / max(bounds.height, 1)
            let previewAspect = image.size.width / max(image.size.height, 1)
            if abs(requestedAspect - previewAspect) < 0.02 {
                return preview
            }
        }

        // Cloud recovery restores the authoritative PKDrawing file. Older
        // recovery points did not include the derived PNG preview, so rebuild
        // it lazily instead of requiring the user to open the drawing tool.
        let previewImage = PencilInkColor.renderPreview(
            drawing: drawing,
            bounds: bounds
        )
        guard let previewData = previewImage.pngData() else {
            return nil
        }
        try savePreview(previewData, documentID: documentID)
        return try loadPreview(documentID: documentID)
    }

    private func fileURL(
        documentID: String,
        extension fileExtension: String
    ) throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = root.appendingPathComponent(
            "PencilDrawings",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let safeID = documentID.map { character in
            character.isLetter || character.isNumber || character == "-"
                ? character
                : "_"
        }
        return directory
            .appendingPathComponent(String(safeID))
            .appendingPathExtension(fileExtension)
    }
}

@MainActor
public final class NativeDrawingViewController: UIViewController, PKCanvasViewDelegate {
    public var onDone: ((NativeDrawingResult) -> Void)?

    private let backgroundImage: UIImage?
    private let canvasView = PKCanvasView()
    private let color: UIColor
    private let documentID: String
    private let initialTool: NativeDrawingTool
    private let store: any PencilDrawingStore
    private let width: CGFloat
    private var loadError: Error?
    private var pendingSave: Task<Void, Never>?
    private var persistenceError: Error?
    private var presentedLoadError = false

    private enum DrawingPersistenceError: Error {
        case previewUnavailable
    }

    public init(
        documentID: String,
        color: UIColor,
        width: CGFloat,
        initialTool: NativeDrawingTool = .pen,
        backgroundImage: UIImage? = nil,
        store: any PencilDrawingStore = ApplicationSupportPencilDrawingStore()
    ) {
        self.backgroundImage = backgroundImage
        self.documentID = documentID
        self.color = color
        self.initialTool = initialTool
        self.width = width
        self.store = store
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        title = "Draw"
        overrideUserInterfaceStyle = .light
        view.backgroundColor = UIColor(
            red: 0.965,
            green: 0.941,
            blue: 0.886,
            alpha: 1
        )

        canvasView.overrideUserInterfaceStyle = .light
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.backgroundColor = .clear
        canvasView.drawingPolicy = .anyInput
        switch initialTool {
        case .pen:
            canvasView.tool = PKInkingTool(
                .pen,
                color: PencilInkColor.forLightPaper(color),
                width: width
            )
        case .eraser:
            canvasView.tool = PKEraserTool(.vector)
        }

        if let backgroundImage {
            let backgroundView = UIImageView(image: backgroundImage)
            backgroundView.translatesAutoresizingMaskIntoConstraints = false
            backgroundView.contentMode = .scaleToFill
            backgroundView.isUserInteractionEnabled = false
            view.addSubview(backgroundView)
            NSLayoutConstraint.activate([
                backgroundView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                backgroundView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                backgroundView.topAnchor.constraint(equalTo: view.topAnchor),
                backgroundView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])
        }
        view.addSubview(canvasView)

        NSLayoutConstraint.activate([
            canvasView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            canvasView.topAnchor.constraint(equalTo: view.topAnchor),
            canvasView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        let undoButton = UIBarButtonItem(
            image: UIImage(systemName: "arrow.uturn.backward"),
            style: .plain,
            target: self,
            action: #selector(undo)
        )
        undoButton.accessibilityLabel = "Undo last mark"
        let penButton = UIBarButtonItem(
            image: UIImage(systemName: "pencil.tip"),
            style: .plain,
            target: self,
            action: #selector(selectPen)
        )
        penButton.accessibilityLabel = "Use pen"
        let eraserButton = UIBarButtonItem(
            image: UIImage(systemName: "eraser"),
            style: .plain,
            target: self,
            action: #selector(selectEraser)
        )
        eraserButton.accessibilityLabel = "Use eraser"
        navigationItem.leftBarButtonItems = [
            undoButton,
            penButton,
            eraserButton
        ]
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(done)
        )

        loadDrawing()
        canvasView.delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(saveForBackground(_:)),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reportPersistenceError(_:)),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard loadError != nil, !presentedLoadError else {
            return
        }
        presentedLoadError = true
        let alert = UIAlertController(
            title: "Drawing could not be opened",
            message: "The existing drawing has been preserved. Close this screen and try again.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Close", style: .default) {
            [weak self] _ in
            self?.navigationController?.dismiss(animated: true) {
                self?.onDone?(
                    NativeDrawingResult(saved: false, preview: nil)
                )
            }
        })
        present(alert, animated: true)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func loadDrawing() {
        do {
            guard let data = try store.load(documentID: documentID) else {
                return
            }
            canvasView.drawing = try PKDrawing(data: data)
        } catch {
            loadError = error
            canvasView.isUserInteractionEnabled = false
        }
    }

    private func saveDrawing() throws -> PencilDrawingPreview? {
        if let loadError {
            throw loadError
        }
        if canvasView.drawing.strokes.isEmpty {
            try store.remove(documentID: documentID)
            return nil
        }
        let bounds = canvasView.bounds.isEmpty
            ? CGRect(x: 0, y: 0, width: 1200, height: 820)
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

    private func saveAndRememberFailure() {
        do {
            _ = try saveDrawing()
            persistenceError = nil
        } catch {
            persistenceError = error
        }
    }

    @objc private func undo() {
        canvasView.undoManager?.undo()
    }

    @objc private func selectPen() {
        canvasView.tool = PKInkingTool(
            .pen,
            color: PencilInkColor.forLightPaper(color),
            width: width
        )
    }

    @objc private func selectEraser() {
        canvasView.tool = PKEraserTool(.vector)
    }

    @objc private func saveForBackground(_ notification: Notification) {
        pendingSave?.cancel()
        saveAndRememberFailure()
    }

    @objc private func reportPersistenceError(_ notification: Notification) {
        guard persistenceError != nil,
              presentedViewController == nil,
              loadError == nil else {
            return
        }
        let alert = UIAlertController(
            title: "Recent marks may not be saved",
            message: "Keep this drawing open and tap Done to try saving again.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    @objc private func done() {
        pendingSave?.cancel()
        do {
            let preview = try saveDrawing()
            persistenceError = nil
            dismiss(animated: true) { [weak self] in
                self?.onDone?(
                    NativeDrawingResult(saved: true, preview: preview)
                )
            }
        } catch {
            let alert = UIAlertController(
                title: "Drawing not saved",
                message: "Keep this screen open and try Done again.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
        }
    }
}

public extension UIColor {
    convenience init?(hexRGB: String) {
        let value = hexRGB.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard value.count == 6, let integer = UInt64(value, radix: 16) else {
            return nil
        }
        self.init(
            red: CGFloat((integer >> 16) & 0xff) / 255,
            green: CGFloat((integer >> 8) & 0xff) / 255,
            blue: CGFloat(integer & 0xff) / 255,
            alpha: 1
        )
    }
}
#endif
