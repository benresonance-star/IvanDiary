import CoreGraphics
import Foundation
import Testing
@testable import AppleDrawingKit

@Suite("Drawing overlay visual mask policy")
struct DrawingOverlayMaskPolicyTests {
    @Test("empty holes keep the full overlay bounds")
    func emptyHolesKeepFullBounds() {
        let bounds = CGRect(x: 0, y: 0, width: 200, height: 100)
        let path = DrawingOverlayMaskPolicy.maskPath(bounds: bounds, holes: [])

        #expect(path.boundingBox == bounds)
        #expect(DrawingOverlayMaskPolicy.usesEvenOddFill)
    }

    @Test("holes inside the overlay stay visual-only and clipped to bounds")
    func holesAreClippedToOverlayBounds() {
        let bounds = CGRect(x: 0, y: 0, width: 200, height: 100)
        let path = DrawingOverlayMaskPolicy.maskPath(
            bounds: bounds,
            holes: [
                CGRect(x: 20, y: 10, width: 40, height: 30),
                CGRect(x: 180, y: 80, width: 50, height: 40),
            ]
        )

        #expect(path.boundingBox == bounds)
    }
}
