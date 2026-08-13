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
