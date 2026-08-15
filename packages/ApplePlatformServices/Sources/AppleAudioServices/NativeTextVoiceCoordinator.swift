import Foundation

@MainActor
public protocol NativeTextRecording: AnyObject {
    func start(maximumDurationMilliseconds: Int?) async throws -> JournalRecordingSnapshot
    func currentPowerLevel() -> Float
    func stop() throws -> JournalRecordingSnapshot
    func acknowledgeSaved() throws -> JournalRecordingSnapshot
}

public extension NativeTextRecording {
    func currentPowerLevel() -> Float { 0 }
}

@MainActor
public protocol NativeTextTranscribing: AnyObject {
    func requestPermission() async -> Bool
    func transcribe(
        fileURL: URL,
        localeIdentifier: String,
        contextualStrings: [String],
        onPartialResult: (@MainActor @Sendable (String) -> Void)?
    ) async throws -> JournalTranscriptionResult
}

public protocol NativeTextStorageChecking: AnyObject {
    func storageHealth(lowStorageThreshold: Int64) -> StorageHealth
}

extension AppleSpeechTranscriber: NativeTextTranscribing {}
extension JournalFileStore: NativeTextStorageChecking {}
#if canImport(AVFoundation) && os(iOS)
extension JournalAudioRecorder: NativeTextRecording {}
#endif

public enum NativeTextVoiceError: LocalizedError {
    case lowStorage
    case missingRecording
    case microphoneUnavailable
    case speechPermissionDenied
    case noSpeechRecognized
    case recognitionTimedOut
    case speechUnavailable

    public var errorDescription: String? {
        switch self {
        case .lowStorage:
            "Storage is too low to record safely. Free some space or use the keyboard."
        case .missingRecording:
            "The recording could not be read. Try again or use the keyboard."
        case .microphoneUnavailable:
            "The microphone could not start. Check permission or use the keyboard."
        case .speechPermissionDenied:
            "Speech recognition permission is off. Your text is unchanged."
        case .noSpeechRecognized:
            "No words were recognized. Try again or use the keyboard."
        case .recognitionTimedOut:
            "Speech recognition took too long. Try again or use the keyboard."
        case .speechUnavailable:
            "Voice could not be turned into text. Try again or use the keyboard."
        }
    }
}

@MainActor
public final class NativeTextVoiceCoordinator {
    private let recorder: any NativeTextRecording
    private let transcriber: any NativeTextTranscribing
    private let storage: any NativeTextStorageChecking
    private let fileManager: FileManager
    private(set) public var recording = false

    public var currentPowerLevel: Float {
        recording ? recorder.currentPowerLevel() : 0
    }

    public init(
        recorder: any NativeTextRecording,
        transcriber: any NativeTextTranscribing,
        storage: any NativeTextStorageChecking,
        fileManager: FileManager = .default
    ) {
        self.recorder = recorder
        self.transcriber = transcriber
        self.storage = storage
        self.fileManager = fileManager
    }

    #if canImport(AVFoundation) && os(iOS)
    public convenience init(fileManager: FileManager = .default) throws {
        try self.init(
            recorder: JournalAudioRecorder(fileManager: fileManager),
            transcriber: AppleSpeechTranscriber(),
            storage: JournalFileStore(fileManager: fileManager),
            fileManager: fileManager
        )
    }
    #endif

    public func start(maximumDurationMilliseconds: Int?) async throws {
        guard !storage.storageHealth(
            lowStorageThreshold: 100 * 1_024 * 1_024
        ).lowStorage else {
            throw NativeTextVoiceError.lowStorage
        }
        do {
            _ = try await recorder.start(
                maximumDurationMilliseconds: maximumDurationMilliseconds
            )
            recording = true
        } catch {
            throw NativeTextVoiceError.microphoneUnavailable
        }
    }

    public func stopAndTranscribe(
        localeIdentifier: String,
        contextualStrings: [String],
        onPartialResult: (@MainActor @Sendable (String) -> Void)? = nil
    ) async throws -> String {
        let snapshot: JournalRecordingSnapshot
        do {
            snapshot = try recorder.stop()
            recording = false
        } catch {
            recording = false
            throw NativeTextVoiceError.missingRecording
        }
        guard let temporaryURL = snapshot.temporaryURL else {
            throw NativeTextVoiceError.missingRecording
        }
        defer {
            try? fileManager.removeItem(at: temporaryURL)
            _ = try? recorder.acknowledgeSaved()
        }

        guard await transcriber.requestPermission() else {
            throw NativeTextVoiceError.speechPermissionDenied
        }
        do {
            let result = try await transcriber.transcribe(
                fileURL: temporaryURL,
                localeIdentifier: localeIdentifier,
                contextualStrings: Array(contextualStrings.prefix(100)),
                onPartialResult: onPartialResult
            )
            return result.text
        } catch AppleSpeechTranscriptionError.permissionDenied {
            throw NativeTextVoiceError.speechPermissionDenied
        } catch AppleSpeechTranscriptionError.noSpeechRecognized {
            throw NativeTextVoiceError.noSpeechRecognized
        } catch AppleSpeechTranscriptionError.timedOut {
            throw NativeTextVoiceError.recognitionTimedOut
        } catch {
            throw NativeTextVoiceError.speechUnavailable
        }
    }

    public func cancel() {
        guard recording else { return }
        let snapshot = try? recorder.stop()
        recording = false
        if let temporaryURL = snapshot?.temporaryURL {
            try? fileManager.removeItem(at: temporaryURL)
        }
        _ = try? recorder.acknowledgeSaved()
    }
}
