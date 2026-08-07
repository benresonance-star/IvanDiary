import UIKit
import Capacitor
import AppleDrawingKit

@objc(PencilKitPlugin)
public final class PencilKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PencilKitPlugin"
    public let jsName = "PencilKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "undoOverlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPreview", returnType: CAPPluginReturnPromise)
    ]

    @MainActor
    private var overlay: NativeDrawingOverlay?

    @MainActor
    private func drawingOverlay() -> NativeDrawingOverlay {
        if let overlay {
            return overlay
        }
        let created = NativeDrawingOverlay()
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
        guard let frame = rect(from: call) else {
            call.reject("A valid overlay frame is required.")
            return
        }

        let opacity = max(0, min(call.getDouble("opacity") ?? 1, 1))
        let color = PencilInkColor.fromHexRGB(
            call.getString("color") ?? "#244A60",
            alpha: opacity
        )
        let width = max(1, min(call.getDouble("width") ?? 4, 28))
        let tool = NativeDrawingTool(
            rawValue: call.getString("tool") ?? ""
        ) ?? .pen
        let legacyInk = legacyInkDocument(from: call)

        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            guard let host = self.overlayHost() else {
                call.reject("The native drawing host is unavailable.")
                return
            }
            do {
                let overlay = self.drawingOverlay()
                try overlay.present(
                    in: host,
                    documentID: documentID,
                    color: color,
                    width: CGFloat(width),
                    tool: tool,
                    frame: frame,
                    legacyInk: legacyInk
                )
                call.resolve([
                    "visible": true,
                    "importedLegacyStrokes": legacyInk?.strokes.isEmpty == false
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
        let tool = call.getString("tool").flatMap(NativeDrawingTool.init(rawValue:))
        let frame = call.getObject("rect") == nil ? nil : rect(from: call)

        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("The PencilKit plugin is unavailable.")
                return
            }
            let overlay = self.drawingOverlay()
            overlay.update(
                color: color,
                width: width.map { CGFloat($0) },
                tool: tool,
                frame: frame
            )
            call.resolve(["visible": overlay.isPresented])
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

    @objc public func getPreview(_ call: CAPPluginCall) {
        guard let documentID = call.getString("documentId"),
              !documentID.isEmpty else {
            call.reject("A documentId is required.")
            return
        }
        do {
            let preview = try ApplicationSupportPencilDrawingStore()
                .loadContentPreview(documentID: documentID)
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

    private func rect(from call: CAPPluginCall) -> CGRect? {
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

        let rectInWebView = CGRect(x: x, y: y, width: width, height: height)
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

final class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PencilKitPlugin())
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
