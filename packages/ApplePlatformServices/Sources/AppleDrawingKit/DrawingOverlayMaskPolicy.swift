import CoreGraphics
import Foundation

public enum DrawingOverlayMaskPolicy {
    public static let usesEvenOddFill = true

    public static func maskPath(
        bounds: CGRect,
        holes: [CGRect]
    ) -> CGPath {
        let path = CGMutablePath()
        path.addRect(bounds)
        for hole in holes {
            let clipped = hole.intersection(bounds)
            guard !clipped.isNull, !clipped.isEmpty else {
                continue
            }
            path.addRect(clipped)
        }
        return path
    }
}
