import Foundation

public enum NativeTextLiveEvent: Equatable, Sendable {
    case provisional(sessionID: UUID, text: String, sequence: Int)
    case finalized(sessionID: UUID, text: String, sequence: Int)
    case failed(sessionID: UUID, error: AppleLiveSpeechError)
}

@MainActor
public protocol NativeTextLiveRecognizing: AnyObject {
    var currentPowerLevel: Float { get }

    func start(
        sessionID: UUID,
        localeIdentifier: String,
        contextualStrings: [String],
        onEvent:
            @escaping @MainActor @Sendable (NativeTextLiveEvent) -> Void
    ) async throws

    func stop() async throws -> String
    func cancel()
}

#if canImport(AVFoundation) && canImport(Speech) && os(iOS)
extension AppleLiveSpeechRecognizer: NativeTextLiveRecognizing {}

@MainActor
private final class TieredLiveSpeechRecognizer:
    NativeTextLiveRecognizing
{
    private var active: (any NativeTextLiveRecognizing)?

    var currentPowerLevel: Float {
        active?.currentPowerLevel ?? 0
    }

    func start(
        sessionID: UUID,
        localeIdentifier: String,
        contextualStrings: [String],
        onEvent:
            @escaping @MainActor @Sendable (NativeTextLiveEvent) -> Void
    ) async throws {
        if #available(iOS 26.0, *) {
            let modern = AppleModernLiveSpeechRecognizer()
            do {
                try await modern.start(
                    sessionID: sessionID,
                    localeIdentifier: localeIdentifier,
                    contextualStrings: contextualStrings,
                    onEvent: onEvent
                )
                active = modern
                return
            } catch {
                modern.cancel()
            }
        }
        let legacy = AppleLiveSpeechRecognizer()
        try await legacy.start(
            sessionID: sessionID,
            localeIdentifier: localeIdentifier,
            contextualStrings: contextualStrings,
            onEvent: onEvent
        )
        active = legacy
    }

    func stop() async throws -> String {
        guard let active else {
            throw AppleLiveSpeechError.noSpeechRecognized
        }
        defer { self.active = nil }
        return try await active.stop()
    }

    func cancel() {
        active?.cancel()
        active = nil
    }
}
#endif

public enum NativeTextVoiceError: LocalizedError {
    case microphoneUnavailable
    case microphonePermissionDenied
    case speechPermissionDenied
    case noSpeechRecognized
    case recognitionTimedOut
    case interrupted
    case speechUnavailable

    public var errorDescription: String? {
        switch self {
        case .microphoneUnavailable:
            "The microphone could not start. Try again or use the keyboard."
        case .microphonePermissionDenied:
            "Microphone permission is off. Your text is unchanged."
        case .speechPermissionDenied:
            "Speech recognition permission is off. Your text is unchanged."
        case .noSpeechRecognized:
            "No words were recognized. Try again or use the keyboard."
        case .recognitionTimedOut:
            "Finishing the transcription took too long. Your text is unchanged."
        case .interrupted:
            "Voice entry was interrupted. Your text is unchanged."
        case .speechUnavailable:
            "Live speech recognition is unavailable. Try again or use the keyboard."
        }
    }
}

@MainActor
public final class NativeTextVoiceCoordinator {
    private let liveRecognizer: any NativeTextLiveRecognizing
    private var sessionID: UUID?
    private(set) public var recording = false

    public var currentPowerLevel: Float {
        recording ? liveRecognizer.currentPowerLevel : 0
    }

    public init(liveRecognizer: any NativeTextLiveRecognizing) {
        self.liveRecognizer = liveRecognizer
    }

    #if canImport(AVFoundation) && canImport(Speech) && os(iOS)
    public convenience init() {
        self.init(liveRecognizer: TieredLiveSpeechRecognizer())
    }
    #endif

    public func start(
        localeIdentifier: String,
        contextualStrings: [String],
        onEvent:
            @escaping @MainActor @Sendable (NativeTextLiveEvent) -> Void
    ) async throws {
        liveRecognizer.cancel()
        recording = false
        let sessionID = UUID()
        self.sessionID = sessionID
        do {
            try await liveRecognizer.start(
                sessionID: sessionID,
                localeIdentifier: localeIdentifier,
                contextualStrings: Array(contextualStrings.prefix(100)),
                onEvent: { [weak self] event in
                    guard let self, self.sessionID == event.sessionID else {
                        return
                    }
                    if case .failed = event {
                        recording = false
                    }
                    onEvent(event)
                }
            )
            recording = true
        } catch AppleLiveSpeechError.microphonePermissionDenied {
            throw NativeTextVoiceError.microphonePermissionDenied
        } catch AppleLiveSpeechError.speechPermissionDenied {
            throw NativeTextVoiceError.speechPermissionDenied
        } catch AppleLiveSpeechError.recognizerUnavailable {
            throw NativeTextVoiceError.speechUnavailable
        } catch AppleLiveSpeechError.audioInputUnavailable {
            throw NativeTextVoiceError.microphoneUnavailable
        } catch {
            throw NativeTextVoiceError.speechUnavailable
        }
    }

    public func stop() async throws -> String {
        recording = false
        do {
            return try await liveRecognizer.stop()
        } catch AppleLiveSpeechError.noSpeechRecognized {
            throw NativeTextVoiceError.noSpeechRecognized
        } catch AppleLiveSpeechError.timedOut {
            throw NativeTextVoiceError.recognitionTimedOut
        } catch {
            throw NativeTextVoiceError.speechUnavailable
        }
    }

    public func cancel() {
        recording = false
        sessionID = nil
        liveRecognizer.cancel()
    }

    private static func map(
        _ error: AppleLiveSpeechError
    ) -> NativeTextVoiceError {
        switch error {
        case .microphonePermissionDenied:
            .microphonePermissionDenied
        case .speechPermissionDenied:
            .speechPermissionDenied
        case .recognizerUnavailable:
            .speechUnavailable
        case .audioInputUnavailable:
            .microphoneUnavailable
        case .interrupted:
            .interrupted
        case .noSpeechRecognized:
            .noSpeechRecognized
        case .timedOut:
            .recognitionTimedOut
        }
    }
}

private extension NativeTextLiveEvent {
    var sessionID: UUID {
        switch self {
        case .provisional(let sessionID, _, _),
             .finalized(let sessionID, _, _),
             .failed(let sessionID, _):
            sessionID
        }
    }
}
