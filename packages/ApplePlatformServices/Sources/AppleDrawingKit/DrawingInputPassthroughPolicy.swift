import CoreGraphics
import Foundation

public enum DrawingInputPassthroughPolicy {
    public static func passesThrough(
        point: CGPoint,
        regions: [CGRect]
    ) -> Bool {
        regions.contains(where: { (region: CGRect) -> Bool in
            point.x >= region.origin.x &&
                point.x <= region.origin.x + region.size.width &&
                point.y >= region.origin.y &&
                point.y <= region.origin.y + region.size.height
        })
    }
}
