import CoreGraphics
import Foundation
import Testing
@testable import AppleDrawingKit

@Suite("Drawing input passthrough policy")
struct DrawingInputPassthroughPolicyTests {
    @Test("points inside voice regions pass through")
    func pointsInsideRegionsPassThrough() {
        let regions = [CGRect(x: 20, y: 30, width: 100, height: 60)]

        #expect(
            DrawingInputPassthroughPolicy.passesThrough(
                point: CGPoint(x: 70, y: 50),
                regions: regions
            )
        )
    }

    @Test("points outside voice regions remain drawing input")
    func pointsOutsideRegionsRemainDrawingInput() {
        let regions = [CGRect(x: 20, y: 30, width: 100, height: 60)]

        #expect(
            !DrawingInputPassthroughPolicy.passesThrough(
                point: CGPoint(x: 150, y: 50),
                regions: regions
            )
        )
    }
}
