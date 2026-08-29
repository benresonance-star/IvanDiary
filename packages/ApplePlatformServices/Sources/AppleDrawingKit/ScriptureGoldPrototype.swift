#if canImport(Metal)
import Foundation

public struct ScriptureGoldBenchmarkResult: Equatable, Sendable {
    public let iterations: Int
    public let totalMilliseconds: Double
    public var averageMilliseconds: Double { totalMilliseconds / Double(iterations) }
}

/// Deterministic prototype fixtures and timing used before the material is
/// connected to Pencil or text persistence.
public enum ScriptureGoldPrototype {
    public static func scriptureMask(width: Int = 640, height: Int = 240) throws -> ScriptureGoldMask {
        guard width > 0, height > 0 else { throw ScriptureGoldError.invalidMask }
        var alpha = [UInt8](repeating: 0, count: width * height)
        let strokes: [(Float, Float, Float, Float, Float)] = [
            (0.08, 0.28, 0.88, 0.28, 0.038),
            (0.13, 0.48, 0.80, 0.48, 0.026),
            (0.19, 0.67, 0.91, 0.67, 0.034),
            (0.31, 0.18, 0.35, 0.78, 0.018),
            (0.57, 0.18, 0.62, 0.78, 0.022),
        ]
        for y in 0..<height {
            for x in 0..<width {
                let point = SIMD2(Float(x) / Float(width), Float(y) / Float(height))
                var coverage: Float = 0
                for stroke in strokes {
                    let start = SIMD2(stroke.0, stroke.1)
                    let end = SIMD2(stroke.2, stroke.3)
                    let vector = end - start
                    let lengthSquared = max(vector.x * vector.x + vector.y * vector.y, 0.000_001)
                    let offset = point - start
                    let t = max(0, min(1, (offset.x * vector.x + offset.y * vector.y) / lengthSquared))
                    let nearest = start + vector * t
                    let delta = point - nearest
                    let distance = sqrt(delta.x * delta.x + delta.y * delta.y)
                    coverage = max(coverage, 1 - smoothstep(stroke.4 * 0.55, stroke.4, distance))
                }
                alpha[y * width + x] = UInt8(max(0, min(255, Int(coverage * 255))))
            }
        }
        return try ScriptureGoldMask(width: width, height: height, alpha: alpha)
    }

    public static func benchmark(renderer: ScriptureGoldRenderer, mask: ScriptureGoldMask, iterations: Int = 30) throws -> ScriptureGoldBenchmarkResult {
        let count = max(1, iterations)
        _ = try renderer.render(mask: mask, reduceMotion: true)
        let start = ProcessInfo.processInfo.systemUptime
        for index in 0..<count {
            _ = try renderer.render(mask: mask, elapsed: Double(index) / 30)
        }
        let milliseconds = (ProcessInfo.processInfo.systemUptime - start) * 1_000
        return ScriptureGoldBenchmarkResult(iterations: count, totalMilliseconds: milliseconds)
    }

    private static func smoothstep(_ edge0: Float, _ edge1: Float, _ value: Float) -> Float {
        let t = max(0, min(1, (value - edge0) / (edge1 - edge0)))
        return t * t * (3 - 2 * t)
    }
}
#endif
