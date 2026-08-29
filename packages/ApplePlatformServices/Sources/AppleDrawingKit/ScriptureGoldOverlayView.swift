#if canImport(MetalKit) && canImport(PencilKit) && canImport(UIKit)
import MetalKit
import PencilKit
import UIKit

/// A derivative, non-interactive highlight over gold PencilKit strokes.
/// PKDrawing remains the sole editable and persisted drawing authority.
@MainActor
final class ScriptureGoldOverlayView: MTKView, MTKViewDelegate {
    private struct Uniforms {
        var phase: Float
        var reduceMotion: Float
        var aspectRatio: Float
        var raised: Float
        var sparkle: Float
        var elapsed: Float
    }

    private var commandQueue: MTLCommandQueue?
    private var pipeline: MTLRenderPipelineState?
    private var maskTexture: MTLTexture?
    private var startedAt = CACurrentMediaTime()
    private var finish: NativeGoldFinish = .raised

    init() {
        let metalDevice = MTLCreateSystemDefaultDevice()
        super.init(frame: .zero, device: metalDevice)
        isOpaque = false
        backgroundColor = .clear
        clearColor = MTLClearColorMake(0, 0, 0, 0)
        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        preferredFramesPerSecond = 30
        enableSetNeedsDisplay = false
        isPaused = false
        delegate = self
        commandQueue = metalDevice?.makeCommandQueue()
        pipeline = Self.makePipeline(device: metalDevice, pixelFormat: colorPixelFormat)
        isHidden = pipeline == nil
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setDrawing(_ drawing: PKDrawing, canvasSize: CGSize, active: Bool, finish: NativeGoldFinish) {
        self.finish = finish
        guard active || !drawing.strokes.isEmpty,
              bounds.width > 0, bounds.height > 0,
              let device else {
            maskTexture = nil
            isHidden = true
            return
        }
        let goldStrokes = drawing.strokes.filter { Self.isScriptureGold($0.ink.color) }
        guard !goldStrokes.isEmpty else {
            maskTexture = nil
            isHidden = true
            return
        }
        let renderSize = CGSize(width: max(canvasSize.width, bounds.width), height: max(canvasSize.height, bounds.height))
        let image = PKDrawing(strokes: goldStrokes).image(
            from: CGRect(origin: .zero, size: renderSize),
            scale: min(window?.screen.scale ?? UIScreen.main.scale, 2)
        )
        guard let cgImage = image.cgImage else {
            maskTexture = nil
            isHidden = true
            return
        }
        maskTexture = try? MTKTextureLoader(device: device).newTexture(
            cgImage: cgImage,
            options: [.SRGB: false, .origin: MTKTextureLoader.Origin.topLeft]
        )
        isHidden = maskTexture == nil
        draw()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard !isHidden,
              let maskTexture, let pipeline, let commandQueue,
              let pass = currentRenderPassDescriptor,
              let drawable = currentDrawable,
              let commandBuffer = commandQueue.makeCommandBuffer(),
              let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        let elapsed = CACurrentMediaTime() - startedAt
        var uniforms = Uniforms(
            phase: ScriptureGoldMaterial.scripture.phase(
                elapsed: elapsed,
                reduceMotion: UIAccessibility.isReduceMotionEnabled
            ),
            reduceMotion: UIAccessibility.isReduceMotionEnabled ? 1 : 0,
            aspectRatio: Float(max(bounds.width, 1) / max(bounds.height, 1)),
            raised: finish == .smooth ? 0 : 1,
            sparkle: finish == .sparkle && !UIAccessibility.isReduceMotionEnabled ? 1 : 0,
            elapsed: Float(elapsed)
        )
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(maskTexture, index: 0)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<Uniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
        encoder.endEncoding()
        commandBuffer.present(drawable)
        commandBuffer.commit()
    }

    private static func isScriptureGold(_ color: UIColor) -> Bool {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return false }
        return abs(red - 184 / 255) < 0.025 && abs(green - 134 / 255) < 0.025 && abs(blue - 47 / 255) < 0.025
    }

    private static func makePipeline(device: MTLDevice?, pixelFormat: MTLPixelFormat) -> MTLRenderPipelineState? {
        guard let device,
              let library = try? device.makeLibrary(source: shaderSource, options: nil),
              let vertex = library.makeFunction(name: "scriptureGoldVertex"),
              let fragment = library.makeFunction(name: "scriptureGoldHighlight") else { return nil }
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = vertex
        descriptor.fragmentFunction = fragment
        descriptor.colorAttachments[0].pixelFormat = pixelFormat
        descriptor.colorAttachments[0].isBlendingEnabled = true
        descriptor.colorAttachments[0].sourceRGBBlendFactor = .one
        descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        descriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
        descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        return try? device.makeRenderPipelineState(descriptor: descriptor)
    }

    private static let shaderSource = #"""
    #include <metal_stdlib>
    using namespace metal;
    struct VertexOut { float4 position [[position]]; float2 uv; };
    struct Uniforms { float phase; float reduceMotion; float aspectRatio; float raised; float sparkle; float elapsed; };
    float hash21(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vertex VertexOut scriptureGoldVertex(uint id [[vertex_id]]) {
        float2 positions[4] = { {-1,-1}, {1,-1}, {-1,1}, {1,1} };
        float2 uv[4] = { {0,1}, {1,1}, {0,0}, {1,0} };
        return { float4(positions[id], 0, 1), uv[id] };
    }
    fragment float4 scriptureGoldHighlight(VertexOut in [[stage_in]], texture2d<float> mask [[texture(0)]], constant Uniforms& u [[buffer(0)]]) {
        constexpr sampler s(coord::normalized, address::clamp_to_zero, filter::linear);
        float2 texel = 1.0 / float2(mask.get_width(), mask.get_height());
        float alpha = mask.sample(s, in.uv).a;
        float left = mask.sample(s, in.uv - float2(texel.x, 0)).a;
        float right = mask.sample(s, in.uv + float2(texel.x, 0)).a;
        float up = mask.sample(s, in.uv - float2(0, texel.y)).a;
        float down = mask.sample(s, in.uv + float2(0, texel.y)).a;
        float shifted = mask.sample(s, in.uv - float2(texel.x * 2.6, texel.y * 3.2)).a;
        float lowerNeighbour = mask.sample(s, in.uv + float2(texel.x * 1.2, texel.y * 1.8)).a;
        float contactShadow = max(shifted - alpha, 0.0) * u.raised;
        if (alpha < 0.01 && contactShadow < 0.01) discard_fragment();
        float3 normal = normalize(float3((left - right) * 2.8 * u.raised, (up - down) * 2.8 * u.raised, 1.0));
        float3 light = normalize(float3(-0.45, -0.55, 0.9));
        float diffuse = max(dot(normal, light), 0.0);
        float edgeHighlight = pow(max(dot(reflect(-light, normal), float3(0,0,1)), 0.0), 18.0) * u.raised;
        float lowerRim = max(alpha - lowerNeighbour, 0.0) * u.raised;
        float2 page = float2(in.uv.x * u.aspectRatio, in.uv.y);
        float projected = dot(page, normalize(float2(0.82, 0.57)));
        float extent = u.aspectRatio * 0.82 + 0.57;
        float centre = mix(-0.12, extent + 0.12, u.phase);
        float band = exp(-pow((projected - centre) / 0.105, 2.0));
        float glint = smoothstep(0.08, 0.95, band) * alpha;
        float smoothStrength = mix(0.72, 0.38, u.reduceMotion);
        float strength = mix(smoothStrength, smoothStrength * 0.68, u.raised);
        float relief = alpha * u.raised * (0.15 * diffuse + 0.48 * edgeHighlight);
        float outAlpha = saturate(glint * strength + relief + contactShadow * 0.30 + lowerRim * 0.28);
        float3 colour = float3(1.0, 0.91, 0.48) * (glint * strength + relief);
        colour += float3(0.13, 0.055, 0.008) * (contactShadow * 0.30 + lowerRim * 0.28);
        float2 cells = float2(22.0 * u.aspectRatio, 15.0);
        float2 cell = floor(in.uv * cells);
        float random = hash21(cell);
        float2 centreInCell = float2(hash21(cell + 3.17), hash21(cell + 8.43));
        float distanceToGlint = length(fract(in.uv * cells) - centreInCell);
        float pulse = pow(max(sin(u.elapsed * (1.3 + random) + random * 31.4), 0.0), 24.0);
        float sparkle = smoothstep(0.14, 0.0, distanceToGlint) * pulse * step(0.72, random) * alpha * u.sparkle;
        colour += float3(1.0, 0.985, 0.78) * sparkle * 0.88;
        outAlpha = saturate(outAlpha + sparkle * 0.88);
        return float4(colour, outAlpha);
    }
    """#
}
#endif
