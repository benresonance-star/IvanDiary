import UIKit
@preconcurrency import Capacitor
import AppleDrawingKit
import AppleAudioServices

@objc(PencilKitPlugin)
@MainActor
public final class PencilKitPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "PencilKitPlugin"
    public let jsName = "PencilKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteDrawing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "undoOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "redoOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPreview", returnType: CAPPluginReturnPromise)
    ]

    private var overlay: NativeDrawingOverlay?

    private func drawingOverlay() -> NativeDrawingOverlay {
        if let overlay {
            return overlay
        }
        let created = NativeDrawingOverlay()
        created.onDrawingChanged = { [weak self] documentID in
            self?.notifyListeners(
                "drawingChanged",
                data: ["documentId": documentID]
            )
        }
        created.onCanvasTapped = { [weak self, weak created] point in
            guard let self,
                  let created,
                  let webView = self.bridge?.webView,
                  let documentID = created.documentID else {
                return
            }
            let webPoint = created.convert(point, to: webView)
            self.notifyListeners(
                "overlayTapped",
                data: [
                    "documentId": documentID,
                    "x": webPoint.x,
                    "y": webPoint.y
                ]
            )
        }
        created.onCanvasLongPressed = { [weak self, weak created] point in
            guard let self,
                  let created,
                  let webView = self.bridge?.webView,
                  let documentID = created.documentID else {
                return
            }
            let webPoint = created.convert(point, to: webView)
            self.notifyListeners(
                "overlayLongPressed",
                data: [
                    "documentId": documentID,
                    "x": webPoint.x,
                    "y": webPoint.y
                ]
            )
        }
        self.overlay = created
        return created
    }

    @objc public func open(_ call: CAPPluginCall) {
        guard let documentID = call.getString("documentId"),
              !documentID.isEmpty else {
            call.reject("A documentId is required.")
            return
        }

        let opacity = max(0, min(call.getDouble("opacity") ?? 1, 1))
        let color = PencilInkColor.fromHexRGB(
            call.getString("color") ?? "#244A60",
            alpha: opacity
        )
        let width = max(1, min(call.getDouble("width") ?? 4, 28))
        let initialTool = NativeDrawingTool(
            rawValue: call.getString("initialTool") ?? ""
        ) ?? .pen
        let backgroundImage = image(
            fromDataURL: call.getString("backgroundDataUrl")
        )

        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.reject("The native drawing host is unavailable.")
                return
            }
            guard host.presentedViewController == nil else {
                call.reject("Another native screen is already open.")
                return
            }

            let editor = NativeDrawingViewController(
                documentID: documentID,
                color: color,
                width: CGFloat(width),
                initialTool: initialTool,
                backgroundImage: backgroundImage
            )
            let navigationController = UINavigationController(
                rootViewController: editor
            )
            navigationController.modalPresentationStyle = .fullScreen
            editor.onDone = { [weak self] result in
                call.resolve(
                    self?.response(
                        saved: result.saved,
                        preview: result.preview
                    ) ?? ["saved": result.saved, "available": false]
                )
            }
            host.present(navigationController, animated: true)
        }
    }

    @objc public func showOverlay(_ call: CAPPluginCall) {
        guard let documentID = call.getString("documentId"),
              !documentID.isEmpty else {
            call.reject("A documentId is required.")
            return
        }
        guard let frameInWebView = webViewRect(from: call) else {
            call.reject("A valid overlay frame is required.")
            return
        }

        let opacity = max(0, min(call.getDouble("opacity") ?? 1, 1))
        let color = PencilInkColor.fromHexRGB(
            call.getString("color") ?? "#244A60",
            alpha: opacity
        )
        let width = max(1, min(call.getDouble("width") ?? 4, 28))
        let nib = NativeDrawingNib(rawValue: call.getString("nib") ?? "") ?? .pen
        let fingerDrawing = call.getBool("fingerDrawing") ?? true
        let twoFingerUndo = call.getBool("twoFingerUndo") ?? true
        let tool = NativeDrawingTool(
            rawValue: call.getString("tool") ?? ""
        ) ?? .pen
        let legacyInk = legacyInkDocument(from: call)
        let clipToCircle = call.getString("clipShape") == "circle"
        let grid = drawingGrid(from: call)
        let overlayShapes = nativeOverlayShapes(from: call)

        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            guard let host = self.overlayHost() else {
                call.reject("The native drawing host is unavailable.")
                return
            }
            let frame = self.overlayHostRect(from: frameInWebView)
            do {
                let overlay = self.drawingOverlay()
                let importedLegacyStrokes = try overlay.present(
                    in: host,
                    documentID: documentID,
                    color: color,
                    width: CGFloat(width),
                    nib: nib,
                    fingerDrawing: fingerDrawing,
                    twoFingerUndo: twoFingerUndo,
                    tool: tool,
                    grid: grid,
                    frame: frame,
                    clipToCircle: clipToCircle,
                    legacyInk: legacyInk,
                    overlayShapes: overlayShapes
                )
                call.resolve([
                    "visible": true,
                    "importedLegacyStrokes": importedLegacyStrokes
                ])
            } catch {
                call.reject("The drawing overlay could not be opened.", nil, error)
            }
        }
    }

    @objc public func updateOverlay(_ call: CAPPluginCall) {
        let colorValue = call.getString("color")
        let opacity = call.getDouble("opacity").map { max(0, min($0, 1)) }
        let color = colorValue.map {
            PencilInkColor.fromHexRGB($0, alpha: opacity ?? 1)
        }
        let width = call.getDouble("width").map { max(1, min($0, 28)) }
        let nib = call.getString("nib").flatMap(NativeDrawingNib.init(rawValue:))
        let fingerDrawing = call.getBool("fingerDrawing")
        let twoFingerUndo = call.getBool("twoFingerUndo")
        let tool = call.getString("tool").flatMap(NativeDrawingTool.init(rawValue:))
        let frameInWebView = call.getObject("rect") == nil
            ? nil
            : webViewRect(from: call)
        let clipToCircle = call.getString("clipShape").map { $0 == "circle" }
        let grid = call.getObject("grid") == nil ? nil : drawingGrid(from: call)
        let overlayShapes = call.getArray("overlayShapes") == nil
            ? nil
            : nativeOverlayShapes(from: call)

        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            let overlay = self.drawingOverlay()
            let frame = frameInWebView.map(self.overlayHostRect(from:))
            overlay.update(
                color: color,
                width: width.map { CGFloat($0) },
                nib: nib,
                fingerDrawing: fingerDrawing,
                twoFingerUndo: twoFingerUndo,
                tool: tool,
                grid: grid,
                frame: frame,
                clipToCircle: clipToCircle,
                overlayShapes: overlayShapes
            )
            call.resolve(["visible": overlay.isPresented])
        }
    }

    private func drawingGrid(from call: CAPPluginCall) -> DrawingGridSettings {
        let value = call.getObject("grid") ?? [:]
        let enabled = value["enabled"] as? Bool ?? false
        let snapToGrid = value["snapToGrid"] as? Bool ?? true
        let spacing = value["spacing"] as? Double ?? 60
        let rotation = value["rotationDegrees"] as? Double ?? 0
        let type = (value["type"] as? String)
            .flatMap(DrawingGridVisualType.init(rawValue:)) ?? .lines
        let colorHex = value["color"] as? String
            ?? DrawingGridSettings.defaultColorHex
        let originX = call.getDouble("gridOriginX") ?? 0
        let originY = call.getDouble("gridOriginY") ?? 0
        let pageWidth = call.getDouble("gridPageWidth") ?? 1200
        let pageHeight = call.getDouble("gridPageHeight") ?? 820
        return DrawingGridSettings(
            enabled: enabled,
            snapToGrid: snapToGrid,
            spacing: CGFloat(max(36, min(spacing, 96))),
            rotationDegrees: DrawingGridSettings.clampedRotation(rotation),
            origin: CGPoint(x: originX, y: originY),
            pageSize: CGSize(width: pageWidth, height: pageHeight),
            documentSize: CGSize(
                width: call.getDouble("gridDocumentWidth") ?? 1200,
                height: call.getDouble("gridDocumentHeight") ?? 820
            ),
            type: type,
            colorHex: colorHex
        )
    }

    private func nativeOverlayShapes(from call: CAPPluginCall) -> [NativeOverlayShape] {
        (call.getArray("overlayShapes", JSObject.self) ?? []).compactMap { value in
            guard let kindValue = value["kind"] as? String,
                  let kind = NativeOverlayShape.Kind(rawValue: kindValue),
                  let x = doubleValue(value["x"]),
                  let y = doubleValue(value["y"]),
                  let width = doubleValue(value["width"]),
                  let height = doubleValue(value["height"]),
                  width > 0, height > 0 else {
                return nil
            }
            let points = (value["points"] as? [Any] ?? []).compactMap { rawPoint -> CGPoint? in
                guard let point = rawPoint as? JSObject,
                      let pointX = doubleValue(point["x"]),
                      let pointY = doubleValue(point["y"]) else { return nil }
                return CGPoint(x: pointX, y: pointY)
            }
            return NativeOverlayShape(
                kind: kind,
                frame: CGRect(x: x, y: y, width: width, height: height),
                rotationDegrees: CGFloat(doubleValue(value["rotationDegrees"]) ?? 0),
                points: points,
                fillColorHex: value["fillColor"] as? String,
                outlineColorHex: value["outlineColor"] as? String,
                outlineWidth: CGFloat(doubleValue(value["outlineWidth"]) ?? 0)
            )
        }
    }

    @objc public func hideOverlay(_ call: CAPPluginCall) {
        let shouldSave = call.getBool("save") ?? true
        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            do {
                let overlay = self.drawingOverlay()
                let wasPresented = overlay.isPresented
                let preview = try overlay.hide(save: shouldSave)
                var payload = self.response(saved: shouldSave, preview: preview)
                payload["didHide"] = wasPresented
                call.resolve(payload)
            } catch {
                call.reject("The drawing overlay could not be closed.", nil, error)
            }
        }
    }

    @objc public func flushOverlay(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            do {
                let overlay = self.drawingOverlay()
                let preview = try overlay.flushSave()
                call.resolve(
                    self.response(
                        saved: overlay.isPresented,
                        preview: preview
                    )
                )
            } catch {
                call.reject("The drawing could not be saved.", nil, error)
            }
        }
    }

    @objc public func undoOverlay(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            self?.drawingOverlay().undo()
            call.resolve(["undone": true])
        }
    }

    @objc public func clearOverlay(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            do {
                let overlay = self.drawingOverlay()
                let preview = try overlay.clearDrawing()
                call.resolve(
                    self.response(
                        saved: overlay.isPresented,
                        preview: preview
                    )
                )
            } catch {
                call.reject("The drawing could not be cleared.", nil, error)
            }
        }
    }

    @objc public func deleteDrawing(_ call: CAPPluginCall) {
        guard let documentID = call.getString("documentId"),
              !documentID.isEmpty else {
            call.reject("A documentId is required.")
            return
        }
        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            do {
                try self.drawingOverlay().removeDrawing(
                    documentID: documentID
                )
                call.resolve(["deleted": true])
            } catch {
                call.reject("The drawing could not be removed.", nil, error)
            }
        }
    }

    @objc public func redoOverlay(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            self?.drawingOverlay().redo()
            call.resolve(["redone": true])
        }
    }

    @objc public func getPreview(_ call: CAPPluginCall) {
        guard let documentID = call.getString("documentId"),
              !documentID.isEmpty else {
            call.reject("A documentId is required.")
            return
        }
        do {
            let width = max(call.getDouble("width") ?? 1200, 1)
            let height = max(call.getDouble("height") ?? 820, 1)
            let preview = try ApplicationSupportPencilDrawingStore()
                .loadContentPreview(
                    documentID: documentID,
                    bounds: CGRect(x: 0, y: 0, width: width, height: height)
                )
            call.resolve(response(saved: true, preview: preview))
        } catch {
            call.reject("The drawing preview could not be loaded.", nil, error)
        }
    }

    private func overlayHost() -> UIView? {
        guard let webView = bridge?.webView,
              let parent = webView.superview else {
            return bridge?.viewController?.view
        }
        return parent
    }

    private func webViewRect(from call: CAPPluginCall) -> CGRect? {
        guard let values = call.getObject("rect") else {
            return nil
        }
        let x = values["x"] as? Double
        let y = values["y"] as? Double
        let width = values["width"] as? Double
        let height = values["height"] as? Double
        guard let x, let y, let width, let height,
              width > 0, height > 0 else {
            return nil
        }

        return CGRect(x: x, y: y, width: width, height: height)
    }

    private func overlayHostRect(from rectInWebView: CGRect) -> CGRect {
        guard let webView = bridge?.webView,
              let parent = webView.superview else {
            return rectInWebView
        }
        return webView.convert(rectInWebView, to: parent)
    }

    private func legacyInkDocument(from call: CAPPluginCall) -> LegacyInkDocument? {
        guard let values = call.getObject("legacyInk") else {
            return nil
        }
        guard let width = doubleValue(values["width"]),
              let height = doubleValue(values["height"]),
              width > 0, height > 0,
              let rawStrokes = values["strokes"] as? [Any] else {
            return nil
        }

        let strokes: [LegacyInkStroke] = rawStrokes.compactMap { rawStroke in
            guard let stroke = rawStroke as? JSObject,
                  let color = stroke["color"] as? String,
                  let strokeWidth = doubleValue(stroke["width"]),
                  let rawPoints = stroke["points"] as? [Any] else {
                return nil
            }
            let points: [LegacyInkPoint] = rawPoints.compactMap { rawPoint in
                guard let point = rawPoint as? JSObject,
                      let x = doubleValue(point["x"]),
                      let y = doubleValue(point["y"]) else {
                    return nil
                }
                return LegacyInkPoint(
                    x: x,
                    y: y,
                    pressure: doubleValue(point["pressure"]) ?? 0.5,
                    timestamp: doubleValue(point["timestamp"]) ?? 0
                )
            }
            guard !points.isEmpty else {
                return nil
            }
            return LegacyInkStroke(
                color: color,
                width: strokeWidth,
                points: points
            )
        }
        guard !strokes.isEmpty else {
            return nil
        }
        return LegacyInkDocument(
            width: width,
            height: height,
            strokes: strokes
        )
    }

    private func doubleValue(_ value: Any?) -> Double? {
        switch value {
        case let number as Double:
            return number
        case let number as NSNumber:
            return number.doubleValue
        default:
            return nil
        }
    }

    private func image(fromDataURL value: String?) -> UIImage? {
        guard let value,
              let separator = value.firstIndex(of: ",") else {
            return nil
        }
        let encoded = String(value[value.index(after: separator)...])
        guard let data = Data(base64Encoded: encoded) else {
            return nil
        }
        return UIImage(data: data)
    }

    private func response(
        saved: Bool,
        preview: PencilDrawingPreview?
    ) -> JSObject {
        guard let preview else {
            return ["saved": saved, "available": false]
        }
        return [
            "saved": saved,
            "available": true,
            "previewUri": preview.fileURL.absoluteString,
            "modifiedAt": preview.modifiedAt.timeIntervalSince1970 * 1000
        ]
    }
}

@objc(NativeTextEditorPlugin)
@MainActor
public final class NativeTextEditorPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "NativeTextEditorPlugin"
    public let jsName = "NativeTextEditor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc public func open(_ call: CAPPluginCall) {
        let initialText = call.getString("initialText") ?? ""
        let mode = NativeTextEditorMode(
            rawValue: call.getString("mode") ?? ""
        ) ?? .add
        let contextualStrings = Array(
            (call.getArray("contextualStrings", String.self) ?? []).prefix(100)
        )
        let recordingLimitMilliseconds = call.getInt(
            "recordingLimitMilliseconds"
        )
        let localeIdentifier = call.getString("localeIdentifier") ?? "en-AU"

        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.reject("The native text editor host is unavailable.")
                return
            }
            guard host.presentedViewController == nil else {
                call.reject("Another native screen is already open.")
                return
            }

            let editor = NativeTextEditorViewController(
                text: initialText,
                mode: mode,
                contextualStrings: contextualStrings,
                recordingLimitMilliseconds: recordingLimitMilliseconds,
                localeIdentifier: localeIdentifier
            )
            editor.modalPresentationStyle = .overFullScreen
            editor.modalTransitionStyle = .crossDissolve
            editor.onComplete = { result in
                call.resolve([
                    "cancelled": result.cancelled,
                    "text": result.text
                ])
            }
            host.present(
                editor,
                animated: !UIAccessibility.isReduceMotionEnabled
            )
        }
    }
}

@MainActor
private enum AppOrientationPolicy {
    static var landscapeLocked = true
}

@objc(NativeJournalStorePlugin)
@MainActor
public final class NativeJournalStorePlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "NativeJournalStorePlugin"
    public let jsName = "NativeJournalStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise)
    ]

    private var storeURL: URL {
        get throws {
            let root = try FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ).appendingPathComponent("IvanDiary", isDirectory: true)
            try FileManager.default.createDirectory(
                at: root,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            return root.appendingPathComponent("journal-envelope.json")
        }
    }

    @objc public func read(_ call: CAPPluginCall) {
        do {
            let url = try storeURL
            guard FileManager.default.fileExists(atPath: url.path) else {
                call.resolve(["available": false])
                return
            }
            let contents = try String(contentsOf: url, encoding: .utf8)
            call.resolve(["available": true, "contents": contents])
        } catch {
            call.reject("Protected journal storage could not be read.", nil, error)
        }
    }

    @objc public func write(_ call: CAPPluginCall) {
        guard let contents = call.getString("contents"),
              let data = contents.data(using: .utf8) else {
            call.reject("Valid journal contents are required.")
            return
        }
        do {
            let url = try storeURL
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            call.resolve()
        } catch {
            call.reject("Protected journal storage could not be written.", nil, error)
        }
    }
}

@objc(AppOrientationPlugin)
@MainActor
public final class AppOrientationPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "AppOrientationPlugin"
    public let jsName = "AppOrientation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "setLandscapeLocked",
            returnType: CAPPluginReturnPromise
        )
    ]

    @objc public func setLandscapeLocked(_ call: CAPPluginCall) {
        let locked = call.getBool("locked") ?? true
        DispatchQueue.main.async { [weak self] in
            AppOrientationPolicy.landscapeLocked = locked
            guard let host = self?.bridge?.viewController else {
                call.reject("The app orientation host is unavailable.")
                return
            }

            if #available(iOS 16.0, *) {
                host.setNeedsUpdateOfSupportedInterfaceOrientations()
                let mask: UIInterfaceOrientationMask =
                    locked ? .landscape : .all
                host.view.window?.windowScene?.requestGeometryUpdate(
                    .iOS(interfaceOrientations: mask)
                ) { _ in }
                call.resolve()
            } else {
                if locked {
                    UIDevice.current.setValue(
                        UIInterfaceOrientation.landscapeLeft.rawValue,
                        forKey: "orientation"
                    )
                }
                UIViewController.attemptRotationToDeviceOrientation()
                call.resolve()
            }
        }
    }
}

final class AppViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        AppOrientationPolicy.landscapeLocked ? .landscape : .all
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PencilKitPlugin())
        bridge?.registerPluginInstance(NativeTextEditorPlugin())
        bridge?.registerPluginInstance(AppOrientationPlugin())
        bridge?.registerPluginInstance(NativeJournalStorePlugin())
        bridge?.registerPluginInstance(JournalAudioPlugin())
        bridge?.registerPluginInstance(AppleTranscriptionPlugin())
        bridge?.registerPluginInstance(JournalFilesPlugin())
        bridge?.registerPluginInstance(CloudBackupPlugin())
        bridge?.registerPluginInstance(AppLifecyclePlugin())
        bridge?.registerPluginInstance(NativeSharePlugin())
    }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        guard AppOrientationPolicy.landscapeLocked else { return }
        if #available(iOS 16.0, *) {
            window?.rootViewController?
                .setNeedsUpdateOfSupportedInterfaceOrientations()
            window?.windowScene?.requestGeometryUpdate(
                .iOS(interfaceOrientations: .landscape)
            ) { _ in }
        } else {
            UIDevice.current.setValue(
                UIInterfaceOrientation.landscapeLeft.rawValue,
                forKey: "orientation"
            )
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        AppOrientationPolicy.landscapeLocked ? .landscape : .all
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
