import Foundation
import Testing
@testable import AppleDrawingKit

#if canImport(Metal)
import Metal
#endif

@Suite("Scripture Gold material")
struct ScriptureGoldTests {
    @Test("material round trips without animation state")
    func materialRoundTrip() throws {
        let material = ScriptureGoldMaterial.scripture
        let restored = try JSONDecoder().decode(ScriptureGoldMaterial.self, from: JSONEncoder().encode(material))
        #expect(restored == material)
        #expect(material.phase(elapsed: 3, reduceMotion: true) == 0.42)
        #expect(material.phase(elapsed: 0, reduceMotion: false) == 0)
        #expect(material.phase(elapsed: 5, reduceMotion: false) == 1)
        #expect(material.phase(elapsed: 10, reduceMotion: false) == 0)
    }

    @Test("invalid versions parameters and masks are rejected")
    func rejectsInvalidInput() {
        #expect(throws: ScriptureGoldError.unsupportedVersion(2)) { try ScriptureGoldMaterial(version: 2) }
        #expect(throws: ScriptureGoldError.invalidParameters) { try ScriptureGoldMaterial(cycleDuration: 2) }
        #expect(throws: ScriptureGoldError.invalidColour) { try ScriptureGoldMaterial(baseRGB: SIMD3(2, 0, 0)) }
        #expect(throws: ScriptureGoldError.invalidMask) { try ScriptureGoldMask(width: 2, height: 2, alpha: [255]) }
    }

    #if os(iOS) && canImport(Metal)
    @Test("fixed fixture produces transparent paper and illuminated gold")
    func rendersFixture() throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let renderer = try ScriptureGoldRenderer()
        let mask = try ScriptureGoldPrototype.scriptureMask(width: 160, height: 60)
        #expect(mask.alpha.max() == 255)
        let frame = try renderer.render(mask: mask, elapsed: 5)
        #expect(frame.rgba.count == 160 * 60 * 4)
        let alpha = stride(from: 3, to: frame.rgba.count, by: 4).map { frame.rgba[$0] }
        #expect(alpha.contains(0))
        #expect(alpha.contains { $0 > 200 })
        let opaquePixel = try #require(alpha.firstIndex(where: { $0 > 200 }))
        let pixelOffset = opaquePixel * 4
        #expect(frame.rgba[pixelOffset] > frame.rgba[pixelOffset + 2])
    }

    @Test("benchmark harness records repeatable render work")
    func benchmarkHarness() throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let renderer = try ScriptureGoldRenderer()
        let mask = try ScriptureGoldPrototype.scriptureMask(width: 320, height: 120)
        let result = try ScriptureGoldPrototype.benchmark(renderer: renderer, mask: mask, iterations: 3)
        #expect(result.iterations == 3)
        #expect(result.totalMilliseconds > 0)
        #expect(result.averageMilliseconds > 0)
    }
    #endif
}
