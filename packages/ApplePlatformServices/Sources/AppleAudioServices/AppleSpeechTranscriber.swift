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

    public var errorDescription: String? {
        switch self {
        case .permissionDenied: "Speech recognition permission is off."
        case .assetMissing: "The saved recording could not be found."
        case .recognizerUnavailable: "Speech recognition is temporarily unavailable."
        case .noSpeechRecognized: "No speech was recognized in this recording."
        }
    }

    public var code: String {
        switch self {
        case .permissionDenied: "PERMISSION_DENIED"
        case .assetMissing: "ASSET_MISSING"
        case .recognizerUnavailable: "UNAVAILABLE"
        case .noSpeechRecognized: "NO_SPEECH"
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

    public func transcribe(fileURL: URL, localeIdentifier: String, contextualStrings: [String] = []) async throws -> JournalTranscriptionResult {
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

        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = false
        request.taskHint = .dictation
        request.contextualStrings = Array(contextualStrings.prefix(100))
        if #available(iOS 16.0, macOS 13.0, *) { request.addsPunctuation = true }

        return try await withCheckedThrowingContinuation { continuation in
            let completionGate = RecognitionCompletionGate()
            recognizer.recognitionTask(with: request) { result, error in
                if let result, result.isFinal {
                    guard completionGate.claim() else { return }
                    let transcription = result.bestTranscription
                    let text = transcription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else {
                        continuation.resume(throwing: AppleSpeechTranscriptionError.noSpeechRecognized)
                        return
                    }
                    let segments = transcription.segments.map {
                        JournalTranscriptionSegment(
                            text: $0.substring,
                            startMilliseconds: Int(($0.timestamp * 1_000).rounded()),
                            durationMilliseconds: Int(($0.duration * 1_000).rounded()),
                            confidence: $0.confidence,
                            alternatives: Array($0.alternativeSubstrings.prefix(3))
                        )
                    }
                    continuation.resume(returning: JournalTranscriptionResult(
                        text: text,
                        locale: localeIdentifier,
                        segments: segments
                    ))
                } else if let error {
                    guard completionGate.claim() else { return }
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
