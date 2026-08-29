import Foundation
import Speech

final class RecognitionCompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !completed else { return false }
        completed = true
        return true
    }
}

final class RecognitionTaskBox: @unchecked Sendable {
    private let lock = NSLock()
    private var task: SFSpeechRecognitionTask?

    func store(_ task: SFSpeechRecognitionTask) {
        lock.lock()
        self.task = task
        lock.unlock()
    }

    func cancel() {
        lock.lock()
        let task = self.task
        lock.unlock()
        task?.cancel()
    }
}

final class RecognitionResultBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var result: JournalTranscriptionResult?

    func store(_ result: JournalTranscriptionResult) {
        lock.lock()
        self.result = result
        lock.unlock()
    }

    func latest() -> JournalTranscriptionResult? {
        lock.lock()
        defer { lock.unlock() }
        return result
    }
}

public enum AppleSpeechRecognitionMode: Equatable, Sendable {
    case service
    case onDevice
}

public struct JournalTranscriptionSegment: Equatable, Sendable {
    public let text: String
    public let startMilliseconds: Int
    public let durationMilliseconds: Int
    public let confidence: Float
    public let alternatives: [String]

    public init(text: String, startMilliseconds: Int, durationMilliseconds: Int, confidence: Float = 0, alternatives: [String] = []) {
        self.text = text
        self.startMilliseconds = startMilliseconds
        self.durationMilliseconds = durationMilliseconds
        self.confidence = confidence
        self.alternatives = alternatives
    }
}

public struct JournalTranscriptionResult: Equatable, Sendable {
    public let text: String
    public let locale: String
    public let segments: [JournalTranscriptionSegment]

    public init(text: String, locale: String, segments: [JournalTranscriptionSegment]) {
        self.text = text
        self.locale = locale
        self.segments = segments
    }
}

public enum AppleSpeechTranscriptionError: LocalizedError, Equatable {
    case permissionDenied
    case assetMissing
    case recognizerUnavailable
    case noSpeechRecognized
    case timedOut

    public var errorDescription: String? {
        switch self {
        case .permissionDenied: "Speech recognition permission is off."
        case .assetMissing: "The saved recording could not be found."
        case .recognizerUnavailable: "Speech recognition is temporarily unavailable."
        case .noSpeechRecognized: "No speech was recognized in this recording."
        case .timedOut: "Speech recognition took too long. Try again or use the keyboard."
        }
    }

    public var code: String {
        switch self {
        case .permissionDenied: "PERMISSION_DENIED"
        case .assetMissing: "ASSET_MISSING"
        case .recognizerUnavailable: "UNAVAILABLE"
        case .noSpeechRecognized: "NO_SPEECH"
        case .timedOut: "TIMEOUT"
        }
    }
}

@MainActor
public final class AppleSpeechTranscriber {
    public init() {}

    public func requestPermission() async -> Bool {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .notDetermined { return status == .authorized }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    public func transcribe(
        fileURL: URL,
        localeIdentifier: String,
        contextualStrings: [String] = [],
        onPartialResult: (@MainActor @Sendable (String) -> Void)? = nil
    ) async throws -> JournalTranscriptionResult {
        guard fileURL.isFileURL, FileManager.default.fileExists(atPath: fileURL.path) else {
            throw AppleSpeechTranscriptionError.assetMissing
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            throw AppleSpeechTranscriptionError.permissionDenied
        }
        let locale = Locale(identifier: localeIdentifier)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw AppleSpeechTranscriptionError.recognizerUnavailable
        }

        let mode = Self.preferredRecognitionMode(
            operatingSystemMajorVersion:
                ProcessInfo.processInfo.operatingSystemVersion.majorVersion,
            supportsOnDeviceRecognition: recognizer.supportsOnDeviceRecognition
        )
        return try await recognize(
            fileURL: fileURL,
            localeIdentifier: localeIdentifier,
            contextualStrings: contextualStrings,
            recognizer: recognizer,
            requiresOnDeviceRecognition: mode == .onDevice,
            onPartialResult: onPartialResult
        )
    }

    nonisolated public static func preferredRecognitionMode(
        operatingSystemMajorVersion: Int,
        supportsOnDeviceRecognition: Bool
    ) -> AppleSpeechRecognitionMode {
        operatingSystemMajorVersion >= 17 && supportsOnDeviceRecognition
            ? .onDevice
            : .service
    }

    private func recognize(
        fileURL: URL,
        localeIdentifier: String,
        contextualStrings: [String],
        recognizer: SFSpeechRecognizer,
        requiresOnDeviceRecognition: Bool,
        onPartialResult: (@MainActor @Sendable (String) -> Void)?
    ) async throws -> JournalTranscriptionResult {
        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.contextualStrings = Array(contextualStrings.prefix(100))
        request.requiresOnDeviceRecognition = requiresOnDeviceRecognition
        if #available(iOS 16.0, macOS 13.0, *) { request.addsPunctuation = true }

        let taskBox = RecognitionTaskBox()
        let resultBuffer = RecognitionResultBuffer()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
            let completionGate = RecognitionCompletionGate()
            let timeout = DispatchWorkItem {
                guard completionGate.claim() else { return }
                taskBox.cancel()
                if let result = resultBuffer.latest() {
                    continuation.resume(returning: result)
                } else {
                    continuation.resume(
                        throwing: AppleSpeechTranscriptionError.timedOut
                    )
                }
            }
            let task = recognizer.recognitionTask(with: request) { result, error in
                if let result {
                    let transcription = result.bestTranscription
                    let text = transcription.formattedString
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty {
                        let segments = transcription.segments.map {
                            JournalTranscriptionSegment(
                                text: $0.substring,
                                startMilliseconds: Int(
                                    ($0.timestamp * 1_000).rounded()
                                ),
                                durationMilliseconds: Int(
                                    ($0.duration * 1_000).rounded()
                                ),
                                confidence: $0.confidence,
                                alternatives: Array(
                                    $0.alternativeSubstrings.prefix(3)
                                )
                            )
                        }
                        resultBuffer.store(JournalTranscriptionResult(
                            text: text,
                            locale: localeIdentifier,
                            segments: segments
                        ))
                        if let onPartialResult {
                            Task { @MainActor in
                                onPartialResult(text)
                            }
                        }
                    }
                }
                if result?.isFinal == true {
                    guard completionGate.claim() else { return }
                    timeout.cancel()
                    guard let bufferedResult = resultBuffer.latest() else {
                        continuation.resume(throwing: AppleSpeechTranscriptionError.noSpeechRecognized)
                        return
                    }
                    continuation.resume(returning: bufferedResult)
                } else if let error {
                    guard completionGate.claim() else { return }
                    timeout.cancel()
                    if let bufferedResult = resultBuffer.latest() {
                        continuation.resume(returning: bufferedResult)
                    } else {
                        continuation.resume(throwing: error)
                    }
                }
            }
            taskBox.store(task)
            DispatchQueue.main.asyncAfter(
                deadline: .now() + 15,
                execute: timeout
            )
            }
        } onCancel: {
            taskBox.cancel()
        }
    }
}
