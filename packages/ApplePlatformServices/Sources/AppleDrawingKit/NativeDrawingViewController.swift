import PencilKit
import UIKit

public protocol PencilDrawingStore: Sendable {
    func load(documentID: String) throws -> Data?
    func save(_ data: Data, documentID: String) throws
}

public struct ApplicationSupportPencilDrawingStore: PencilDrawingStore {
    public init() {}

    public func load(documentID: String) throws -> Data? {
        let url = try drawingURL(documentID: documentID)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        return try Data(contentsOf: url)
    }

    public func save(_ data: Data, documentID: String) throws {
        let url = try drawingURL(documentID: documentID)
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUnlessOpen]
        )
    }

    private func drawingURL(documentID: String) throws -> URL {
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
            .appendingPathExtension("pkdrawing")
    }
}

@MainActor
public final class NativeDrawingViewController: UIViewController, PKCanvasViewDelegate {
    public var onDone: ((Bool) -> Void)?

    private let canvasView = PKCanvasView()
    private let color: UIColor
    private let documentID: String
    private let store: any PencilDrawingStore
    private let width: CGFloat
    private var loadError: Error?
    private var pendingSave: Task<Void, Never>?
    private var persistenceError: Error?
    private var presentedLoadError = false

    public init(
        documentID: String,
        color: UIColor,
        width: CGFloat,
        store: any PencilDrawingStore = ApplicationSupportPencilDrawingStore()
    ) {
        self.documentID = documentID
        self.color = color
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
        view.backgroundColor = UIColor(
            red: 0.965,
            green: 0.941,
            blue: 0.886,
            alpha: 1
        )

        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.backgroundColor = .clear
        canvasView.drawingPolicy = .anyInput
        canvasView.tool = PKInkingTool(.pen, color: color, width: width)
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
                self?.onDone?(false)
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

    private func saveDrawing() throws {
        if let loadError {
            throw loadError
        }
        try store.save(
            canvasView.drawing.dataRepresentation(),
            documentID: documentID
        )
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
            try saveDrawing()
            persistenceError = nil
        } catch {
            persistenceError = error
        }
    }

    @objc private func undo() {
        canvasView.undoManager?.undo()
    }

    @objc private func selectPen() {
        canvasView.tool = PKInkingTool(.pen, color: color, width: width)
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
            try saveDrawing()
            persistenceError = nil
            dismiss(animated: true) { [weak self] in
                self?.onDone?(true)
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
