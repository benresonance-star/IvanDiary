import Foundation
#if canImport(AVFoundation) && canImport(Speech) && os(iOS)
import AVFoundation
import Speech
#endif

public enum AppleLiveSpeechError: LocalizedError, Equatable {
    case microphonePermissionDenied
    case speechPermissionDenied
    case recognizerUnavailable
    case audioInputUnavailable
    case interrupted
    case noSpeechRecognized
    case timedOut

    public var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            "Microphone permission is off. Your text is unchanged."
        case .speechPermissionDenied:
            "Speech recognition permission is off. Your text is unchanged."
        case .recognizerUnavailable:
            "Live speech recognition is temporarily unavailable."
        case .audioInputUnavailable:
            "The microphone could not start. Try again or use the keyboard."
        case .interrupted:
            "Voice entry was interrupted. Your text is unchanged."
        case .noSpeechRecognized:
            "No words were recognized. Try again or use the keyboard."
        case .timedOut:
            "Finishing the transcription took too long. Your text is unchanged."
        }
    }
}

#if canImport(AVFoundation) && canImport(Speech) && os(iOS)
private final class LivePowerLevel: @unchecked Sendable {
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

private struct LiveRecognitionPacket: Sendable {
    let sequence: Int
    let text: String
    let isFinal: Bool
    let hasError: Bool
}

private final class LiveRecognitionSequencer: @unchecked Sendable {
    private let lock = NSLock()
    private var sequence = 0

    func packet(
        text: String,
        isFinal: Bool,
        hasError: Bool
    ) -> LiveRecognitionPacket {
        lock.lock()
        sequence += 1
        let value = sequence
        lock.unlock()
        return LiveRecognitionPacket(
            sequence: value,
            text: text,
            isFinal: isFinal,
            hasError: hasError
        )
    }
}

@MainActor
public final class AppleLiveSpeechRecognizer {
    private enum SessionPhase {
        case idle
        case listening
        case finishing
    }

    private let audioEngine: AVAudioEngine
    private let audioSession: AVAudioSession
    private let powerLevel = LivePowerLevel()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var latestText = ""
    private var terminalError: Error?
    private var recognitionFinished = false
    private var inputTapInstalled = false
    private var audioObservers: [NSObjectProtocol] = []
    private var isListening = false
    private var phase = SessionPhase.idle
    private var activeSessionID: UUID?
    private var lastSequence = 0
    private var completionGate = RecognitionCompletionGate()
    private var terminalResult: Result<String, AppleLiveSpeechError>?
    private var stopContinuation:
        CheckedContinuation<String, any Error>?
    private var finalizationTimeoutTask: Task<Void, Never>?
    private var onEvent:
        (@MainActor @Sendable (NativeTextLiveEvent) -> Void)?

    public init(
        audioEngine: AVAudioEngine = AVAudioEngine(),
        audioSession: AVAudioSession = .sharedInstance()
    ) {
        self.audioEngine = audioEngine
        self.audioSession = audioSession
    }

    public var currentPowerLevel: Float {
        powerLevel.get()
    }

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
        guard await requestSpeechPermission() else {
            throw AppleLiveSpeechError.speechPermissionDenied
        }

        let locale = Locale(identifier: localeIdentifier)
        guard let recognizer = SFSpeechRecognizer(locale: locale),
              recognizer.isAvailable else {
            throw AppleLiveSpeechError.recognizerUnavailable
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.contextualStrings = Array(contextualStrings.prefix(100))
        request.requiresOnDeviceRecognition = false
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }

        try audioSession.setCategory(
            .record,
            mode: .measurement,
            options: [.allowBluetoothHFP]
        )
        try audioSession.setActive(true)

        latestText = ""
        terminalError = nil
        recognitionFinished = false
        powerLevel.set(0)
        self.onEvent = onEvent
        activeSessionID = sessionID
        phase = .listening
        lastSequence = 0
        completionGate = RecognitionCompletionGate()
        terminalResult = nil
        recognitionRequest = request
        let activeSessionID = sessionID
        let sequencer = LiveRecognitionSequencer()

        recognitionTask = recognizer.recognitionTask(with: request) {
            [weak self] result, error in
            let text = result?.bestTranscription.formattedString
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let packet = sequencer.packet(
                text: text,
                isFinal: result?.isFinal == true,
                hasError: error != nil
            )
            Task { @MainActor [weak self] in
                self?.handle(packet, sessionID: activeSessionID)
            }
        }

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            cancel()
            throw AppleLiveSpeechError.audioInputUnavailable
        }
        let audioTap = Self.makeAudioTap(
            request: request,
            powerLevel: powerLevel
        )
        inputNode.installTap(
            onBus: 0,
            bufferSize: 1_024,
            format: format,
            block: audioTap
        )
        inputTapInstalled = true
        audioEngine.prepare()
        do {
            try audioEngine.start()
            isListening = true
            observeAudioInterruptions()
        } catch {
            cancel()
            throw AppleLiveSpeechError.audioInputUnavailable
        }
    }

    public func stop() async throws -> String {
        if let terminalResult {
            return try terminalResult.get()
        }
        guard recognitionRequest != nil, activeSessionID != nil else {
            throw AppleLiveSpeechError.noSpeechRecognized
        }
        phase = .finishing
        stopAudioCapture()
        recognitionRequest?.endAudio()
        finalizationTimeoutTask?.cancel()
        finalizationTimeoutTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            guard !Task.isCancelled else { return }
            self?.complete(.failure(.timedOut))
        }
        return try await withCheckedThrowingContinuation { continuation in
            if let terminalResult {
                continuation.resume(with: terminalResult)
            } else {
                stopContinuation = continuation
            }
        }
    }

    public func cancel() {
        isListening = false
        phase = .idle
        activeSessionID = nil
        stopAudioCapture()
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        finalizationTimeoutTask?.cancel()
        if let stopContinuation {
            self.stopContinuation = nil
            stopContinuation.resume(
                throwing: AppleLiveSpeechError.interrupted
            )
        }
        cleanupRecognition()
    }

    private func stopAudioCapture() {
        isListening = false
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if inputTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            inputTapInstalled = false
        }
        powerLevel.set(0)
    }

    private func cleanupRecognition() {
        recognitionTask = nil
        recognitionRequest = nil
        onEvent = nil
        recognitionFinished = false
        terminalError = nil
        for observer in audioObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        audioObservers.removeAll()
        try? audioSession.setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    private func handle(
        _ packet: LiveRecognitionPacket,
        sessionID: UUID
    ) {
        guard activeSessionID == sessionID,
              packet.sequence > lastSequence else { return }
        lastSequence = packet.sequence
        if !packet.text.isEmpty {
            latestText = packet.text
            if packet.isFinal {
                onEvent?(
                    .finalized(
                        sessionID: sessionID,
                        text: packet.text,
                        sequence: packet.sequence
                    )
                )
            } else if phase == .listening {
                onEvent?(
                    .provisional(
                        sessionID: sessionID,
                        text: packet.text,
                        sequence: packet.sequence
                    )
                )
            }
        }
        if packet.isFinal {
            let text = packet.text.isEmpty ? latestText : packet.text
            complete(
                text.isEmpty
                    ? .failure(.noSpeechRecognized)
                    : .success(text)
            )
        } else if packet.hasError {
            complete(.failure(.recognizerUnavailable))
        }
    }

    private func complete(
        _ result: Result<String, AppleLiveSpeechError>
    ) {
        guard completionGate.claim() else { return }
        terminalResult = result
        recognitionFinished = true
        phase = .idle
        isListening = false
        finalizationTimeoutTask?.cancel()
        stopAudioCapture()
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        let continuation = stopContinuation
        stopContinuation = nil
        if case .failure(let error) = result,
           let sessionID = activeSessionID {
            onEvent?(.failed(sessionID: sessionID, error: error))
        }
        cleanupRecognition()
        activeSessionID = nil
        continuation?.resume(with: result)
    }

    private func requestMicrophonePermission() async -> Bool {
        if #available(iOS 17.0, *) {
            return await AVAudioApplication.requestRecordPermission()
        }
        return await withCheckedContinuation { continuation in
            audioSession.requestRecordPermission {
                continuation.resume(returning: $0)
            }
        }
    }

    private func requestSpeechPermission() async -> Bool {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .notDetermined {
            return status == .authorized
        }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization {
                continuation.resume(returning: $0 == .authorized)
            }
        }
    }

    private func observeAudioInterruptions() {
        let interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: audioSession,
            queue: .main
        ) { [weak self] notification in
            guard let typeValue = notification.userInfo?[
                AVAudioSessionInterruptionTypeKey
            ] as? UInt,
                AVAudioSession.InterruptionType(rawValue: typeValue) == .began
            else { return }
            Task { @MainActor [weak self] in
                guard let self, isListening else { return }
                isListening = false
                stopAudioCapture()
                recognitionRequest?.endAudio()
                complete(.failure(.interrupted))
            }
        }
        audioObservers.append(interruptionObserver)
        let routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: audioSession,
            queue: .main
        ) { [weak self] notification in
            guard let reasonValue = notification.userInfo?[
                AVAudioSessionRouteChangeReasonKey
            ] as? UInt,
                let reason = AVAudioSession.RouteChangeReason(
                    rawValue: reasonValue
                ),
                reason == .oldDeviceUnavailable
            else { return }
            Task { @MainActor [weak self] in
                guard let self, isListening else { return }
                complete(.failure(.interrupted))
            }
        }
        audioObservers.append(routeObserver)
    }

    nonisolated private static func normalizedPower(
        from buffer: AVAudioPCMBuffer
    ) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<frameCount {
            let sample = channel[index]
            sum += sample * sample
        }
        let rootMeanSquare = sqrt(sum / Float(frameCount))
        guard rootMeanSquare.isFinite, rootMeanSquare > 0 else { return 0 }
        let decibels = 20 * log10(rootMeanSquare)
        let linearLevel = min(1, max(0, (decibels + 60) / 60))
        return pow(linearLevel, 0.55)
    }

    nonisolated private static func makeAudioTap(
        request: SFSpeechAudioBufferRecognitionRequest,
        powerLevel: LivePowerLevel
    ) -> AVAudioNodeTapBlock {
        { [weak request, weak powerLevel] buffer, _ in
            request?.append(buffer)
            powerLevel?.set(normalizedPower(from: buffer))
        }
    }
}
#endif
