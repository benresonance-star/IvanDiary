import PencilKit
import UIKit

/// Journal drawings always sit on light paper. PencilKit otherwise adapts ink
/// for dark mode (near-black becomes near-white), so keep ink in light space.
public enum PencilInkColor {
    public static let defaultInk = UIColor(
        red: 23 / 255,
        green: 20 / 255,
        blue: 16 / 255,
        alpha: 1
    )

    public static func forLightPaper(_ color: UIColor) -> UIColor {
        PKInkingTool.convertColor(color, from: .light, to: .light)
    }

    public static func fromHexRGB(
        _ hex: String?,
        alpha: Double = 1
    ) -> UIColor {
        let opacity = CGFloat(max(0, min(alpha, 1)))
        guard let hex, let parsed = UIColor(hexRGB: hex) else {
            return defaultInk.withAlphaComponent(opacity)
        }
        return forLightPaper(parsed).withAlphaComponent(opacity)
    }

    public static func renderPreview(drawing: PKDrawing, bounds: CGRect) -> UIImage {
        var image = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            image = drawing.image(from: bounds, scale: UIScreen.main.scale)
        }
        return image
    }
}
