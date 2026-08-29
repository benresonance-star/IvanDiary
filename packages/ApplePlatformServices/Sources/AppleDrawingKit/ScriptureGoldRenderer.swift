#if canImport(Metal)
import Foundation
import Metal

public final class ScriptureGoldRenderer: @unchecked Sendable {
    private struct Uniforms {
        var base: SIMD4<Float>
        var shadow: SIMD4<Float>
        var highlight: SIMD4<Float>
        var phase: Float
        var grain: Float
        var intensity: Float
        var bandWidth: Float
        var angle: Float
    }

    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let pipeline: MTLComputePipelineState

    public init(device: MTLDevice? = MTLCreateSystemDefaultDevice()) throws {
        guard let device, let queue = device.makeCommandQueue() else { throw ScriptureGoldError.metalUnavailable }
        do {
            let library = try device.makeLibrary(source: Self.shaderSource, options: nil)
            guard let function = library.makeFunction(name: "renderScriptureGold") else {
                throw ScriptureGoldError.pipelineCreationFailed("Missing renderScriptureGold kernel")
            }
            self.pipeline = try device.makeComputePipelineState(function: function)
        } catch let error as ScriptureGoldError {
            throw error
        } catch {
            throw ScriptureGoldError.pipelineCreationFailed(error.localizedDescription)
        }
        self.device = device
        self.queue = queue
    }

    public func render(mask: ScriptureGoldMask, material: ScriptureGoldMaterial = .scripture, elapsed: TimeInterval = 0, reduceMotion: Bool = false) throws -> ScriptureGoldFrame {
        let maskDescriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm, width: mask.width, height: mask.height, mipmapped: false)
        maskDescriptor.usage = [.shaderRead]
        maskDescriptor.storageMode = .shared
        let outputDescriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: mask.width, height: mask.height, mipmapped: false)
        outputDescriptor.usage = [.shaderWrite]
        outputDescriptor.storageMode = .shared
        guard let maskTexture = device.makeTexture(descriptor: maskDescriptor), let outputTexture = device.makeTexture(descriptor: outputDescriptor) else { throw ScriptureGoldError.renderingFailed }
        mask.alpha.withUnsafeBytes { bytes in
            maskTexture.replace(region: MTLRegionMake2D(0, 0, mask.width, mask.height), mipmapLevel: 0, withBytes: bytes.baseAddress!, bytesPerRow: mask.width)
        }
        var uniforms = Uniforms(
            base: SIMD4(material.baseRGB, 1), shadow: SIMD4(material.shadowRGB, 1), highlight: SIMD4(material.highlightRGB, 1),
            phase: material.phase(elapsed: elapsed, reduceMotion: reduceMotion),
            grain: material.grainAmount, intensity: material.highlightIntensity, bandWidth: material.highlightWidth, angle: material.lightAngleRadians
        )
        guard let commandBuffer = queue.makeCommandBuffer(), let encoder = commandBuffer.makeComputeCommandEncoder() else { throw ScriptureGoldError.renderingFailed }
        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(maskTexture, index: 0)
        encoder.setTexture(outputTexture, index: 1)
        encoder.setBytes(&uniforms, length: MemoryLayout<Uniforms>.stride, index: 0)
        let width = pipeline.threadExecutionWidth
        let height = max(1, pipeline.maxTotalThreadsPerThreadgroup / width)
        encoder.dispatchThreads(MTLSize(width: mask.width, height: mask.height, depth: 1), threadsPerThreadgroup: MTLSize(width: width, height: height, depth: 1))
        encoder.endEncoding()
        commandBuffer.commit()
        commandBuffer.waitUntilCompleted()
        guard commandBuffer.status == .completed else { throw ScriptureGoldError.renderingFailed }
        var rgba = [UInt8](repeating: 0, count: mask.width * mask.height * 4)
        rgba.withUnsafeMutableBytes { bytes in
            outputTexture.getBytes(bytes.baseAddress!, bytesPerRow: mask.width * 4, from: MTLRegionMake2D(0, 0, mask.width, mask.height), mipmapLevel: 0)
        }
        return ScriptureGoldFrame(width: mask.width, height: mask.height, rgba: rgba)
    }

    private static let shaderSource = #"""
    #include <metal_stdlib>
    using namespace metal;
    struct GoldUniforms { float4 base; float4 shadow; float4 highlight; float phase; float grain; float intensity; float bandWidth; float angle; };
    float hash21(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    kernel void renderScriptureGold(texture2d<float, access::read> mask [[texture(0)]], texture2d<float, access::write> output [[texture(1)]], constant GoldUniforms& u [[buffer(0)]], uint2 gid [[thread_position_in_grid]]) {
        uint2 size = uint2(mask.get_width(), mask.get_height());
        if (any(gid >= size)) return;
        float alpha = mask.read(gid).r;
        if (alpha <= 0.001) { output.write(float4(0.0), gid); return; }
        float2 uv = (float2(gid) + 0.5) / float2(size);
        float2 direction = float2(cos(u.angle), sin(u.angle));
        float projected = dot(uv - 0.5, direction) + 0.5;
        float centre = mix(-0.15, 1.15, u.phase);
        float band = exp(-pow((projected - centre) / u.bandWidth, 2.0));
        float grain = (hash21(float2(gid) * 0.73) - 0.5) * u.grain;
        float edge = smoothstep(0.05, 0.7, alpha);
        float3 gold = mix(u.shadow.rgb, u.base.rgb, 0.62 + 0.28 * edge + grain);
        gold = mix(gold, u.highlight.rgb, saturate(band * u.intensity * (0.65 + 0.35 * edge)));
        output.write(float4(gold * alpha, alpha), gid);
    }
    """#
}
#endif
