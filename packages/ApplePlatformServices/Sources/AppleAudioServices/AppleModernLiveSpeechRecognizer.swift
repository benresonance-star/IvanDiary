#if canImport(AVFoundation) && canImport(Speech) && os(iOS) && compiler(>=6.2)
import AVFoundation
import Foundation
import Speech

private final class ModernSpeechPowerLevel: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Float = 0

    func set(_ value: Float) {
        lock.lock()
        self.value = value
        lock.unlock()
    }

    func get() -> Float {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

@available(iOS 26.0, *)
@MainActor
public final class AppleModernLiveSpeechRecognizer:
    NativeTextLiveRecognizing
{
    private let audioEngine = AVAudioEngine()
    private let audioSession = AVAudioSession.sharedInstance()
    private var analyzer: SpeechAnalyzer?
    private var inputContinuation:
        AsyncStream<AnalyzerInput>.Continuation?
    private var analysisTask: Task<Void, Never>?
    private var resultTask: Task<Void, Never>?
    private var activeSessionID: UUID?
    private var eventHandler:
        (@MainActor @Sendable (NativeTextLiveEvent) -> Void)?
    private var finalizedText = ""
    private var provisionalText = ""
    private var sequence = 0
    private let powerLevel = ModernSpeechPowerLevel()
    private var inputTapInstalled = false

    public var currentPowerLevel: Float { powerLevel.get() }

    public init() {}

    public func start(
        sessionID: UUID,
        localeIdentifier: String,
        contextualStrings: [String],
        onEvent:
            @escaping @MainActor @Sendable (NativeTextLiveEvent) -> Void
    ) async throws {
        cancel()
        guard await requestMicrophonePermission() else {
            throw AppleLiveSpeechError.microphonePermissionDenied
        }
        let requestedLocale = Locale(identifier: localeIdentifier)
        activeSessionID = sessionID
        eventHandler = onEvent
        finalizedText = ""
        provisionalText = ""
        sequence = 0

        if contextualStrings.isEmpty,
           SpeechTranscriber.isAvailable,
           let locale = await SpeechTranscriber.supportedLocale(
                equivalentTo: requestedLocale
           ) {
            let transcriber = SpeechTranscriber(
                locale: locale,
                transcriptionOptions: [],
                reportingOptions: [.volatileResults],
                attributeOptions: []
            )
            try await prepareAssets(for: [transcriber])
            analyzer = SpeechAnalyzer(modules: [transcriber])
            resultTask = Task { @MainActor [weak self] in
                do {
                    for try await result in transcriber.results {
                        self?.handle(
                            text: String(result.text.characters),
                            isFinal: result.isFinal
                        )
                    }
                } catch {
                    self?.fail(.recognizerUnavailable)
                }
            }
        } else if let locale = await DictationTranscriber.supportedLocale(
            equivalentTo: requestedLocale
        ) {
            let configuration = try await customLanguageModel(
                locale: locale,
                words: contextualStrings
            )
            var hints: Set<DictationTranscriber.ContentHint> = [.shortForm]
            if let configuration {
                hints.insert(
                    .customizedLanguage(modelConfiguration: configuration)
                )
            }
            let transcriber = DictationTranscriber(
                locale: locale,
                contentHints: hints,
                transcriptionOptions: [],
                reportingOptions: [.volatileResults],
                attributeOptions: []
            )
            try await prepareAssets(for: [transcriber])
            analyzer = SpeechAnalyzer(modules: [transcriber])
            resultTask = Task { @MainActor [weak self] in
                do {
                    for try await result in transcriber.results {
                        self?.handle(
                            text: String(result.text.characters),
                            isFinal: result.isFinal
                        )
                    }
                } catch {
                    self?.fail(.recognizerUnavailable)
                }
            }
        } else {
            throw AppleLiveSpeechError.recognizerUnavailable
        }

        guard let analyzer,
              let format = await SpeechAnalyzer.bestAvailableAudioFormat(
                compatibleWith: analyzer.modules
              ) else {
            throw AppleLiveSpeechError.audioInputUnavailable
        }
        try audioSession.setCategory(.record, mode: .measurement)
        try audioSession.setActive(true)
        let stream = AsyncStream<AnalyzerInput> { continuation in
            inputContinuation = continuation
        }
        try await analyzer.start(inputSequence: stream)
        try installAudioTap(targetFormat: format)
        audioEngine.prepare()
        try audioEngine.start()
    }

    public func stop() async throws -> String {
        stopCapture()
        inputContinuation?.finish()
        guard let analyzer else {
            throw AppleLiveSpeechError.noSpeechRecognized
        }
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        _ = await resultTask?.result
        let text = finalizedText.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        cleanup()
        guard !text.isEmpty else {
            throw AppleLiveSpeechError.noSpeechRecognized
        }
        return text
    }

    public func cancel() {
        stopCapture()
        inputContinuation?.finish()
        analysisTask?.cancel()
        resultTask?.cancel()
        if let analyzer {
            Task { await analyzer.cancelAndFinishNow() }
        }
        cleanup()
    }

    private func handle(text: String, isFinal: Bool) {
        guard let sessionID = activeSessionID else { return }
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sequence += 1
        if isFinal {
            finalizedText = [finalizedText, text]
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            provisionalText = ""
            eventHandler?(
                .finalized(
                    sessionID: sessionID,
                    text: finalizedText,
                    sequence: sequence
                )
            )
        } else {
            provisionalText = text
            eventHandler?(
                .provisional(
                    sessionID: sessionID,
                    text: text,
                    sequence: sequence
                )
            )
        }
    }

    private func fail(_ error: AppleLiveSpeechError) {
        guard let sessionID = activeSessionID else { return }
        eventHandler?(.failed(sessionID: sessionID, error: error))
    }

    private func installAudioTap(
        targetFormat: AVAudioFormat
    ) throws {
        let input = audioEngine.inputNode
        let sourceFormat = input.outputFormat(forBus: 0)
        guard sourceFormat.sampleRate > 0,
              let converter = AVAudioConverter(
                from: sourceFormat,
                to: targetFormat
              ) else {
            throw AppleLiveSpeechError.audioInputUnavailable
        }
        let continuation = inputContinuation
        let powerLevel = powerLevel
        input.installTap(
            onBus: 0,
            bufferSize: 1_024,
            format: sourceFormat
        ) { buffer, _ in
            let capacity = AVAudioFrameCount(
                ceil(
                    Double(buffer.frameLength) *
                    targetFormat.sampleRate /
                    sourceFormat.sampleRate
                )
            )
            guard let converted = AVAudioPCMBuffer(
                pcmFormat: targetFormat,
                frameCapacity: capacity
            ) else { return }
            var supplied = false
            var conversionError: NSError?
            converter.convert(
                to: converted,
                error: &conversionError
            ) { _, status in
                guard !supplied else {
                    status.pointee = .noDataNow
                    return nil
                }
                supplied = true
                status.pointee = .haveData
                return buffer
            }
            guard conversionError == nil else { return }
            continuation?.yield(AnalyzerInput(buffer: converted))
            powerLevel.set(Self.normalizedPower(from: buffer))
        }
        inputTapInstalled = true
    }

    private func stopCapture() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if inputTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            inputTapInstalled = false
        }
        powerLevel.set(0)
    }

    private func cleanup() {
        try? audioSession.setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
        analyzer = nil
        inputContinuation = nil
        analysisTask = nil
        resultTask = nil
        activeSessionID = nil
        eventHandler = nil
    }

    private func prepareAssets(
        for modules: [any SpeechModule]
    ) async throws {
        if let request = try await AssetInventory.assetInstallationRequest(
            supporting: modules
        ) {
            try await request.downloadAndInstall()
        }
    }

    private func customLanguageModel(
        locale: Locale,
        words: [String]
    ) async throws -> SFSpeechLanguageModel.Configuration? {
        let words = Array(words.prefix(100))
        guard !words.isEmpty else { return nil }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("IvanDiarySpeech", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let version = stableIdentifier(for: words)
        let sourceURL = directory.appendingPathComponent("\(version).bin")
        let modelURL = directory.appendingPathComponent("\(version).model")
        let configuration = SFSpeechLanguageModel.Configuration(
            languageModel: modelURL
        )
        if FileManager.default.fileExists(atPath: modelURL.path) {
            return configuration
        }
        let data = SFCustomLanguageModelData(
            locale: locale,
            identifier: "IvanDiary.MyWords",
            version: version
        )
        for word in words {
            data.insert(
                phraseCount: .init(phrase: word, count: 20)
            )
        }
        try await data.export(to: sourceURL)
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, any Error>) in
            SFSpeechLanguageModel.prepareCustomLanguageModel(
                for: sourceURL,
                configuration: configuration
            ) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
        return configuration
    }

    private func stableIdentifier(for words: [String]) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in words.joined(separator: "|").utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }

    private func requestMicrophonePermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    nonisolated private static func normalizedPower(
        from buffer: AVAudioPCMBuffer
    ) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<count {
            sum += channel[index] * channel[index]
        }
        let rootMeanSquare = sqrt(sum / Float(count))
        let decibels = 20 * log10(max(rootMeanSquare, 0.000_001))
        return pow(min(1, max(0, (decibels + 60) / 60)), 0.55)
    }
}
#endif
