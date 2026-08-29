import Foundation

/// Stable, presentation-independent parameters for Ivan's illuminated gold.
/// Animation time is deliberately not part of the persisted material.
public struct ScriptureGoldMaterial: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public let version: Int
    public let baseRGB: SIMD3<Float>
    public let shadowRGB: SIMD3<Float>
    public let highlightRGB: SIMD3<Float>
    public let grainAmount: Float
    public let highlightIntensity: Float
    public let highlightWidth: Float
    public let cycleDuration: Float
    public let lightAngleRadians: Float

    public init(
        version: Int = currentVersion,
        baseRGB: SIMD3<Float> = SIMD3(0.72, 0.43, 0.10),
        shadowRGB: SIMD3<Float> = SIMD3(0.28, 0.13, 0.025),
        highlightRGB: SIMD3<Float> = SIMD3(1.0, 0.91, 0.49),
        grainAmount: Float = 0.13,
        highlightIntensity: Float = 0.72,
        highlightWidth: Float = 0.16,
        cycleDuration: Float = 10,
        lightAngleRadians: Float = 0.62
    ) throws {
        guard version == Self.currentVersion else { throw ScriptureGoldError.unsupportedVersion(version) }
        guard Self.valid(baseRGB), Self.valid(shadowRGB), Self.valid(highlightRGB) else { throw ScriptureGoldError.invalidColour }
        guard (0...0.35).contains(grainAmount), (0...1).contains(highlightIntensity), (0.06...0.4).contains(highlightWidth), (8...12).contains(cycleDuration), lightAngleRadians.isFinite else {
            throw ScriptureGoldError.invalidParameters
        }
        self.version = version
        self.baseRGB = baseRGB
        self.shadowRGB = shadowRGB
        self.highlightRGB = highlightRGB
        self.grainAmount = grainAmount
        self.highlightIntensity = highlightIntensity
        self.highlightWidth = highlightWidth
        self.cycleDuration = cycleDuration
        self.lightAngleRadians = lightAngleRadians
    }

    public static var scripture: ScriptureGoldMaterial { try! ScriptureGoldMaterial() }

    /// A fixed presentation used by previews, exports, and Reduce Motion.
    public func phase(elapsed: TimeInterval, reduceMotion: Bool) -> Float {
        if reduceMotion { return 0.42 }
        let cycle = elapsed.truncatingRemainder(dividingBy: TimeInterval(cycleDuration)) / TimeInterval(cycleDuration)
        // Smooth the ends so the light slows naturally instead of snapping.
        let pingPong = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2
        return Float(pingPong * pingPong * (3 - 2 * pingPong))
    }

    private static func valid(_ colour: SIMD3<Float>) -> Bool {
        colour.x.isFinite && colour.y.isFinite && colour.z.isFinite &&
        (0...1).contains(colour.x) && (0...1).contains(colour.y) && (0...1).contains(colour.z)
    }
}

public enum ScriptureGoldError: Error, Equatable {
    case invalidColour
    case invalidMask
    case invalidParameters
    case metalUnavailable
    case pipelineCreationFailed(String)
    case renderingFailed
    case unsupportedVersion(Int)
}

public struct ScriptureGoldMask: Equatable, Sendable {
    public let width: Int
    public let height: Int
    public let alpha: [UInt8]

    public init(width: Int, height: Int, alpha: [UInt8]) throws {
        guard width > 0, height > 0, width <= 8_192, height <= 8_192,
              width.multipliedReportingOverflow(by: height).overflow == false,
              alpha.count == width * height else { throw ScriptureGoldError.invalidMask }
        self.width = width
        self.height = height
        self.alpha = alpha
    }
}

public struct ScriptureGoldFrame: Equatable, Sendable {
    public let width: Int
    public let height: Int
    /// Premultiplied RGBA8 pixels in row-major order.
    public let rgba: [UInt8]
}
