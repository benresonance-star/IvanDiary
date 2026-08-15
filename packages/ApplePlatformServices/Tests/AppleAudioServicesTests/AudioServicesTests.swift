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

    state.beginRecording()
    #expect(!state.shouldShowSubmitAction(for: .add))
    #expect(state.shouldShowSubmitAction(for: .edit))
}

@Test func nativeTextEditorDefaultsToKeyboard() {
    let state = NativeTextEditorState(text: "")
    #expect(state.inputMethod == .keyboard)
}

@Test func nativeTextEditorReplacesAndCommitsLivePreviewOnce() {
    var state = NativeTextEditorState(
        text: "Hello world",
        selection: NSRange(location: 6, length: 5)
    )
    state.beginLiveTranscription()
    state.updateLivePreview("Ivan")
    #expect(state.text == "Hello Ivan")
    state.updateLivePreview("Ivan Banksia")
    #expect(state.text == "Hello Ivan Banksia")
    state.finishLiveTranscription("Ivan Banksia.")
    #expect(state.text == "Hello Ivan Banksia.")
    #expect(state.phase == .ready)
}

@Test func nativeTextEditorRestoresDraftWhenLiveVoiceFails() {
    var state = NativeTextEditorState(
        text: "Keep this",
        selection: NSRange(location: 4, length: 0)
    )
    state.beginLiveTranscription()
    state.updateLivePreview("temporary words")
    state.failLiveTranscription("Voice stopped")
    #expect(state.text == "Keep this")
    #expect(state.selection == NSRange(location: 4, length: 0))
    #expect(state.phase == .error("Voice stopped"))
}

@Test func nativeTextEditorIgnoresLatePartialWhileFinishing() {
    var state = NativeTextEditorState(text: "Draft")
    state.beginLiveTranscription()
    state.updateLivePreview("first words")
    state.beginTranscribing()
    state.updateLivePreview("late replacement")

    #expect(state.phase == .transcribing)
    #expect(state.text == "Draft first words")
}

@Test func nativeTextEditorKeepsFinalAndProvisionalSpeechSeparate() {
    var state = NativeTextEditorState(text: "Draft")
    state.beginLiveTranscription()
    state.updateLiveFinalized("Hello")
    state.updateLivePreview("world")
    #expect(state.text == "Draft Hello world")
    state.updateLivePreview("world again")
    #expect(state.text == "Draft Hello world again")
    state.beginTranscribing()
    state.finishLiveTranscription("Hello world again")
    #expect(state.text == "Draft Hello world again")
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
            .restoreSelection,
        ]
    )
}

@Test func nativeTextEditorWidthDependsOnlyOnSafeArea() {
    #expect(NativeTextEditorLayout.editorWidth(safeAreaWidth: 1_330) == 920)
    #expect(NativeTextEditorLayout.editorWidth(safeAreaWidth: 980) == 920)
    #expect(NativeTextEditorLayout.editorWidth(safeAreaWidth: 744) == 708)
    #expect(NativeTextEditorLayout.editorWidth(safeAreaWidth: 600) == 564)
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
private final class FakeLiveSpeechRecognizer: NativeTextLiveRecognizing {
    var currentPowerLevel: Float = 0.72
    var contextualStrings: [String] = []
    var localeIdentifier = ""
    var startError: Error?
    var stopError: Error?
    var stoppedText = "Hello Ivan"
    var cancelled = false
    var startCount = 0
    var sessionID = UUID()
    var eventHandler:
        (@MainActor @Sendable (NativeTextLiveEvent) -> Void)?

    func start(
        sessionID: UUID,
        localeIdentifier: String,
        contextualStrings: [String],
        onEvent:
            @escaping @MainActor @Sendable (NativeTextLiveEvent) -> Void
    ) async throws {
        if let startError { throw startError }
        startCount += 1
        self.sessionID = sessionID
        self.localeIdentifier = localeIdentifier
        self.contextualStrings = contextualStrings
        eventHandler = onEvent
        onEvent(
            .provisional(sessionID: sessionID, text: "Hello", sequence: 1)
        )
    }

    func stop() async throws -> String {
        if let stopError { throw stopError }
        return stoppedText
    }

    func cancel() {
        cancelled = true
    }

    func interrupt() {
        eventHandler?(.failed(sessionID: sessionID, error: .interrupted))
    }
}

@MainActor
private final class PartialTextCollector {
    var values: [String] = []
}

@MainActor
@Test func nativeLiveVoiceCapsMyWordsAndPublishesPartials() async throws {
    let recognizer = FakeLiveSpeechRecognizer()
    let partials = PartialTextCollector()
    let coordinator = NativeTextVoiceCoordinator(
        liveRecognizer: recognizer
    )

    try await coordinator.start(
        localeIdentifier: "en-AU",
        contextualStrings: (0..<120).map { "Word \($0)" },
        onEvent: {
            if case .provisional(_, let text, _) = $0 {
                partials.values.append(text)
            }
        }
    )
    #expect(coordinator.recording)
    #expect(coordinator.currentPowerLevel == 0.72)
    let text = try await coordinator.stop()

    #expect(text == "Hello Ivan")
    #expect(recognizer.localeIdentifier == "en-AU")
    #expect(recognizer.contextualStrings.count == 100)
    #expect(partials.values == ["Hello"])
    #expect(!coordinator.recording)
}

@MainActor
@Test func nativeLiveVoiceMapsPermissionFailure() async {
    let recognizer = FakeLiveSpeechRecognizer()
    recognizer.startError = AppleLiveSpeechError.speechPermissionDenied
    let coordinator = NativeTextVoiceCoordinator(
        liveRecognizer: recognizer
    )

    await #expect(throws: NativeTextVoiceError.self) {
        try await coordinator.start(
            localeIdentifier: "en-AU",
            contextualStrings: [],
            onEvent: { _ in }
        )
    }
    #expect(!coordinator.recording)
}

@MainActor
@Test func nativeLiveVoiceCancelStopsRecognition() async throws {
    let recognizer = FakeLiveSpeechRecognizer()
    let coordinator = NativeTextVoiceCoordinator(
        liveRecognizer: recognizer
    )

    try await coordinator.start(
        localeIdentifier: "en-AU",
        contextualStrings: [],
        onEvent: { _ in }
    )
    coordinator.cancel()

    #expect(recognizer.cancelled)
    #expect(!coordinator.recording)
}

@MainActor
@Test func nativeLiveVoiceReportsInterruptionAndCanRestart() async throws {
    let recognizer = FakeLiveSpeechRecognizer()
    let coordinator = NativeTextVoiceCoordinator(
        liveRecognizer: recognizer
    )
    var receivedError: AppleLiveSpeechError?

    try await coordinator.start(
        localeIdentifier: "en-AU",
        contextualStrings: [],
        onEvent: {
            if case .failed(_, let error) = $0 {
                receivedError = error
            }
        }
    )
    recognizer.interrupt()
    #expect(receivedError != nil)
    #expect(!coordinator.recording)
    coordinator.cancel()
    try await coordinator.start(
        localeIdentifier: "en-AU",
        contextualStrings: [],
        onEvent: { _ in }
    )

    #expect(recognizer.startCount == 2)
    #expect(coordinator.recording)
}

@MainActor
@Test func nativeLiveVoiceMapsNoSpeechAndTimeoutOutcomes() async throws {
    let recognizer = FakeLiveSpeechRecognizer()
    let coordinator = NativeTextVoiceCoordinator(
        liveRecognizer: recognizer
    )

    for error in [
        AppleLiveSpeechError.noSpeechRecognized,
        AppleLiveSpeechError.timedOut,
    ] {
        recognizer.stopError = error
        try await coordinator.start(
            localeIdentifier: "en-AU",
            contextualStrings: [],
            onEvent: { _ in }
        )
        await #expect(throws: NativeTextVoiceError.self) {
            try await coordinator.stop()
        }
        #expect(!coordinator.recording)
    }
}
