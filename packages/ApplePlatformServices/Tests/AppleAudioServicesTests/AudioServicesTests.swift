import Foundation
import Testing
@testable import AppleAudioServices

@Test func speechRecognitionCompletionCanOnlyBeClaimedOnce() {
    let gate = RecognitionCompletionGate()
    #expect(gate.claim())
    #expect(!gate.claim())
}

@Test func speechTranscriptionErrorsExposeStableBridgeCodes() {
    #expect(AppleSpeechTranscriptionError.permissionDenied.code == "PERMISSION_DENIED")
    #expect(AppleSpeechTranscriptionError.assetMissing.code == "ASSET_MISSING")
    #expect(AppleSpeechTranscriptionError.recognizerUnavailable.code == "UNAVAILABLE")
    #expect(AppleSpeechTranscriptionError.noSpeechRecognized.code == "NO_SPEECH")
    #expect(AppleSpeechTranscriptionError.timedOut.code == "TIMEOUT")
}

@Test func firstGenerationIPadUsesOneServiceBackedRecognitionAttempt() {
    #expect(
        AppleSpeechTranscriber.preferredRecognitionMode(
            operatingSystemMajorVersion: 16,
            supportsOnDeviceRecognition: true
        ) == .service
    )
    #expect(
        AppleSpeechTranscriber.preferredRecognitionMode(
            operatingSystemMajorVersion: 17,
            supportsOnDeviceRecognition: true
        ) == .onDevice
    )
}

@Test func speechTranscriptionResultPreservesTextLocaleAndTimings() {
    let segment = JournalTranscriptionSegment(text: "Hello", startMilliseconds: 250, durationMilliseconds: 500)
    let result = JournalTranscriptionResult(text: "Hello.", locale: "en-AU", segments: [segment])
    #expect(result.text == "Hello.")
    #expect(result.locale == "en-AU")
    #expect(result.segments == [segment])
}

@Test func recordingTransitionsAndInterruptionRecovery() throws {
    let url = URL(fileURLWithPath: "/tmp/recording.m4a")
    var machine = RecordingStateMachine()
    try machine.start(id: "stable-id", temporaryURL: url)
    #expect(machine.snapshot.state == .recording)
    try machine.interrupt(elapsedMilliseconds: 400)
    #expect(machine.snapshot.state == .interrupted)
    try machine.resume()
    try machine.finalise(elapsedMilliseconds: 900)
    #expect(machine.snapshot.state == .finalising)
    try machine.saved()
    #expect(machine.snapshot.state == .saved)
}

@Test func recoveredRecordingCanProceedToFinalization() throws {
    var machine = RecordingStateMachine()
    machine.recover(JournalRecordingSnapshot(
        id: "recovered-id", state: .recording, elapsedMilliseconds: 700,
        temporaryURL: URL(fileURLWithPath: "/tmp/recovered.m4a")
    ))
    #expect(machine.snapshot.state == .interrupted)
    try machine.finalise(elapsedMilliseconds: machine.snapshot.elapsedMilliseconds)
    try machine.saved()
    #expect(machine.snapshot.state == .saved)
}

@Test func atomicFinalizationProducesOriginalIntegrityMetadataAndTrashIsRecoverable() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let temporary = root.appendingPathComponent("capture.m4a")
    try Data("original-audio".utf8).write(to: temporary)
    let store = try JournalFileStore(applicationSupportRoot: root.appendingPathComponent("support"))
    let asset = try store.finalize(temporaryURL: temporary, assetID: "asset-stable", mimeType: "audio/mp4")
    #expect(asset.id == "asset-stable")
    #expect(asset.byteLength == 14)
    #expect(asset.checksum.count == 64)
    #expect(FileManager.default.fileExists(atPath: asset.url.path))
    #expect(!FileManager.default.fileExists(atPath: temporary.path))
    try store.moveToTrash(assetID: asset.id)
    #expect(!FileManager.default.fileExists(atPath: asset.url.path))
}

@Test func finalizationIsIdempotentWhenDurableAssetAlreadyExists() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let store = try JournalFileStore(applicationSupportRoot: root.appendingPathComponent("support"))
    let first = root.appendingPathComponent("first.m4a")
    try Data("first".utf8).write(to: first)
    let original = try store.finalize(temporaryURL: first, assetID: "same-id", mimeType: "audio/mp4")
    let second = root.appendingPathComponent("second.m4a")
    try Data("second".utf8).write(to: second)
    let reconciled = try store.finalize(temporaryURL: second, assetID: "same-id", mimeType: "audio/mp4")
    #expect(reconciled.checksum == original.checksum)
}

@Test func trashRemovalIncludesDurablePhotoAndFileAssets() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let support = root.appendingPathComponent("support", isDirectory: true)
    let files = support.appendingPathComponent("OriginalFiles", isDirectory: true)
    try FileManager.default.createDirectory(at: files, withIntermediateDirectories: true)
    let photo = files.appendingPathComponent("photo-id.jpg")
    let document = files.appendingPathComponent("file-id.pdf")
    try Data("photo".utf8).write(to: photo)
    try Data("document".utf8).write(to: document)
    let store = try JournalFileStore(applicationSupportRoot: support)

    try store.moveToTrash(assetID: "photo-id")
    try store.moveToTrash(assetID: "file-id")

    #expect(!FileManager.default.fileExists(atPath: photo.path))
    #expect(!FileManager.default.fileExists(atPath: document.path))
    let trash = support.appendingPathComponent("Trash", isDirectory: true)
    let trashedFiles = try FileManager.default.contentsOfDirectory(at: trash, includingPropertiesForKeys: nil)
    #expect(trashedFiles.count == 2)
    #expect(trashedFiles.contains { $0.pathExtension == "jpg" })
    #expect(trashedFiles.contains { $0.pathExtension == "pdf" })
}

@Test func trashRemovalCannotEscapeManagedAssetDirectories() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let support = root.appendingPathComponent("support", isDirectory: true)
    let outside = root.appendingPathComponent("outside.m4a")
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    try Data("keep".utf8).write(to: outside)
    let store = try JournalFileStore(applicationSupportRoot: support)

    try store.moveToTrash(assetID: "../outside")

    #expect(FileManager.default.fileExists(atPath: outside.path))
}

@Test func trashRemovalPreservesPreviouslySupportedAudioIdentifiers() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let temporary = root.appendingPathComponent("capture.m4a")
    try Data("audio".utf8).write(to: temporary)
    let store = try JournalFileStore(applicationSupportRoot: root.appendingPathComponent("support"))
    let asset = try store.finalize(temporaryURL: temporary, assetID: "audio.v1", mimeType: "audio/mp4")

    try store.moveToTrash(assetID: asset.id)

    #expect(!FileManager.default.fileExists(atPath: asset.url.path))
}

@Test func nativeTextEditorInsertsSpeechAtCaretWithReadableSpacing() {
    var state = NativeTextEditorState(
        text: "Hello world",
        selection: NSRange(location: 5, length: 0)
    )

    state.beginTranscribing()
    state.finishTranscribing("dear")

    #expect(state.text == "Hello dear world")
    #expect(state.selection == NSRange(location: 10, length: 0))
    #expect(state.phase == .ready)
}

@Test func nativeTextEditorReplacesSelectionAndClampsInvalidRanges() {
    var state = NativeTextEditorState(
        text: "Hello old world",
        selection: NSRange(location: 6, length: 3)
    )
    state.finishTranscribing("new")
    #expect(state.text == "Hello new world")

    state.update(text: "Short", selection: NSRange(location: 100, length: 100))
    #expect(state.selection == NSRange(location: 5, length: 0))
}

@Test func nativeTextEditorKeepsDraftWhenTranscriptionIsEmptyOrFails() {
    var state = NativeTextEditorState(text: "Keep this")
    state.beginTranscribing()
    state.finishTranscribing("   ")
    #expect(state.text == "Keep this")

    state.fail("Speech recognition is unavailable.")
    #expect(state.text == "Keep this")
    #expect(state.phase == .error("Speech recognition is unavailable."))
}

@Test func nativeTextEditorDisablesDestructiveActionsDuringVoiceWork() {
    var state = NativeTextEditorState(text: "Words")
    #expect(state.canCancel)
    #expect(state.canSubmit)

    state.beginRecording()
    #expect(!state.canCancel)
    #expect(!state.canSubmit)

    state.beginTranscribing()
    #expect(!state.canCancel)
    #expect(!state.canSubmit)
}

@Test func nativeTextEditorOnlyEnablesAddWhenPreviewContainsText() {
    var state = NativeTextEditorState(text: "   \n")
    #expect(!state.hasPreviewContent)
    #expect(!state.canSubmit)
    #expect(!state.shouldShowSubmitAction(for: .add))
    #expect(state.shouldShowSubmitAction(for: .edit))

    state.finishTranscribing("Hello Ivan")
    #expect(state.hasPreviewContent)
    #expect(state.canSubmit)
    #expect(state.shouldShowSubmitAction(for: .add))
}

@Test func nativeKeyboardTransitionsRebuildInputSessionBeforeRestoringSelection() {
    #expect(
        NativeKeyboardSessionCoordinator.transition(to: .keyboard) == [
            .resignFirstResponder,
            .useSystemInputView,
            .reloadInputViews,
            .becomeFirstResponder,
            .restoreSelection,
        ]
    )
    #expect(
        NativeKeyboardSessionCoordinator.transition(to: .voice) == [
            .resignFirstResponder,
            .useHiddenInputView,
            .reloadInputViews,
            .becomeFirstResponder,
            .restoreSelection,
        ]
    )
}

@Test func firstGenerationIPadCapabilityProfileAlwaysUsesSpeechRecognizer() {
    let capabilities = NativeSpeechCapabilities(
        operatingSystemMajorVersion: 16,
        modernAPIAvailable: false,
        modernDeviceSupported: false,
        localeSupported: true,
        assetsInstalled: false,
        preservesContextualStrings: true
    )

    #expect(
        NativeSpeechProviderPolicy.preferredProvider(for: capabilities)
            == .speechRecognizer
    )
}

@Test func modernSpeechRequiresEveryCompatibilityCapability() {
    let supported = NativeSpeechCapabilities(
        operatingSystemMajorVersion: 26,
        modernAPIAvailable: true,
        modernDeviceSupported: true,
        localeSupported: true,
        assetsInstalled: true,
        preservesContextualStrings: true
    )
    #expect(
        NativeSpeechProviderPolicy.preferredProvider(for: supported)
            == .speechAnalyzer
    )

    let missingContext = NativeSpeechCapabilities(
        operatingSystemMajorVersion: 26,
        modernAPIAvailable: true,
        modernDeviceSupported: true,
        localeSupported: true,
        assetsInstalled: true,
        preservesContextualStrings: false
    )
    #expect(
        NativeSpeechProviderPolicy.preferredProvider(for: missingContext)
            == .speechRecognizer
    )
}

@MainActor
private final class FakeTextRecorder: NativeTextRecording {
    let temporaryURL: URL
    var acknowledged = false
    var stopped = false
    var maximumDurationMilliseconds: Int?

    init(temporaryURL: URL) {
        self.temporaryURL = temporaryURL
    }

    func start(
        maximumDurationMilliseconds: Int?
    ) async throws -> JournalRecordingSnapshot {
        self.maximumDurationMilliseconds = maximumDurationMilliseconds
        return JournalRecordingSnapshot(
            id: "voice",
            state: .recording,
            temporaryURL: temporaryURL
        )
    }

    func currentPowerLevel() -> Float { 0.72 }

    func stop() throws -> JournalRecordingSnapshot {
        stopped = true
        return JournalRecordingSnapshot(
            id: "voice",
            state: .finalising,
            temporaryURL: temporaryURL
        )
    }

    func acknowledgeSaved() throws -> JournalRecordingSnapshot {
        acknowledged = true
        return JournalRecordingSnapshot(id: "voice", state: .saved)
    }
}

@MainActor
private final class FakeTextTranscriber: NativeTextTranscribing {
    var permission = true
    var contextualStrings: [String] = []

    func requestPermission() async -> Bool {
        permission
    }

    func transcribe(
        fileURL _: URL,
        localeIdentifier: String,
        contextualStrings: [String],
        onPartialResult: (@MainActor @Sendable (String) -> Void)?
    ) async throws -> JournalTranscriptionResult {
        self.contextualStrings = contextualStrings
        onPartialResult?("Hello")
        return JournalTranscriptionResult(
            text: "Hello Ivan",
            locale: localeIdentifier,
            segments: []
        )
    }
}

private final class FakeTextStorage: NativeTextStorageChecking {
    let lowStorage: Bool

    init(lowStorage: Bool) {
        self.lowStorage = lowStorage
    }

    func storageHealth(lowStorageThreshold _: Int64) -> StorageHealth {
        StorageHealth(availableBytes: nil, lowStorage: lowStorage)
    }
}

@MainActor
private final class PartialTextCollector {
    var values: [String] = []
}

@MainActor
@Test func nativeVoiceTranscriptionCleansTemporaryAudioAndCapsMyWords() async throws {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(
        at: root,
        withIntermediateDirectories: true
    )
    defer { try? FileManager.default.removeItem(at: root) }
    let temporaryURL = root.appendingPathComponent("voice.m4a")
    try Data("voice".utf8).write(to: temporaryURL)
    let recorder = FakeTextRecorder(temporaryURL: temporaryURL)
    let transcriber = FakeTextTranscriber()
    let partials = PartialTextCollector()
    let coordinator = NativeTextVoiceCoordinator(
        recorder: recorder,
        transcriber: transcriber,
        storage: FakeTextStorage(lowStorage: false)
    )

    try await coordinator.start(maximumDurationMilliseconds: 5_000)
    #expect(recorder.maximumDurationMilliseconds == 5_000)
    #expect(coordinator.currentPowerLevel == 0.72)
    let text = try await coordinator.stopAndTranscribe(
        localeIdentifier: "en-AU",
        contextualStrings: (0..<120).map { "Word \($0)" },
        onPartialResult: { partials.values.append($0) }
    )

    #expect(text == "Hello Ivan")
    #expect(transcriber.contextualStrings.count == 100)
    #expect(partials.values == ["Hello"])
    #expect(recorder.acknowledged)
    #expect(!FileManager.default.fileExists(atPath: temporaryURL.path))
}

@MainActor
@Test func nativeVoicePermissionFailureKeepsCleanupGuarantee() async throws {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(
        at: root,
        withIntermediateDirectories: true
    )
    defer { try? FileManager.default.removeItem(at: root) }
    let temporaryURL = root.appendingPathComponent("voice.m4a")
    try Data("voice".utf8).write(to: temporaryURL)
    let recorder = FakeTextRecorder(temporaryURL: temporaryURL)
    let transcriber = FakeTextTranscriber()
    transcriber.permission = false
    let coordinator = NativeTextVoiceCoordinator(
        recorder: recorder,
        transcriber: transcriber,
        storage: FakeTextStorage(lowStorage: false)
    )

    try await coordinator.start(maximumDurationMilliseconds: 5_000)
    #expect(recorder.maximumDurationMilliseconds == 5_000)
    #expect(coordinator.currentPowerLevel == 0.72)
    await #expect(throws: NativeTextVoiceError.self) {
        try await coordinator.stopAndTranscribe(
            localeIdentifier: "en-AU",
            contextualStrings: []
        )
    }

    #expect(recorder.acknowledged)
    #expect(!FileManager.default.fileExists(atPath: temporaryURL.path))
}

@MainActor
@Test func nativeVoiceRejectsLowStorageBeforeStartingRecorder() async {
    let recorder = FakeTextRecorder(
        temporaryURL: URL(fileURLWithPath: "/tmp/not-created.m4a")
    )
    let coordinator = NativeTextVoiceCoordinator(
        recorder: recorder,
        transcriber: FakeTextTranscriber(),
        storage: FakeTextStorage(lowStorage: true)
    )

    await #expect(throws: NativeTextVoiceError.self) {
        try await coordinator.start(maximumDurationMilliseconds: nil)
    }
    #expect(!coordinator.recording)
}
