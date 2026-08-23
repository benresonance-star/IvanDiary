#if canImport(AVFoundation) && os(iOS)
import AVFoundation
import Foundation

@MainActor
public final class JournalAudioRecorder: NSObject, AVAudioRecorderDelegate {
    public private(set) var machine = RecordingStateMachine()
    private let session: AVAudioSession
    private let fileManager: FileManager
    private let temporaryRoot: URL
    private let recoveryURL: URL
    private var recorder: AVAudioRecorder?
    private var monitorRecorder: AVAudioRecorder?
    private var monitorURL: URL?
    private var monitoringGeneration = 0
    private var startedAt: Date?

    public init(fileManager: FileManager = .default) throws {
        self.fileManager = fileManager
        session = .sharedInstance()
        temporaryRoot = fileManager.temporaryDirectory.appendingPathComponent("JournalRecordings", isDirectory: true)
        let support = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        recoveryURL = support.appendingPathComponent("unfinished-recording.json")
        super.init()
        try fileManager.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
        observeAudioSession()
    }

    public func start(maximumDurationMilliseconds: Int? = nil) async throws -> JournalRecordingSnapshot {
        stopMonitoring()
        let granted: Bool
        if #available(iOS 17.0, *) {
            granted = await AVAudioApplication.requestRecordPermission()
        } else {
            granted = await withCheckedContinuation { continuation in
                session.requestRecordPermission { continuation.resume(returning: $0) }
            }
        }
        guard granted else { throw NSError(domain: "JournalAudio", code: 1, userInfo: ["code": "PERMISSION_DENIED"]) }
        let id = UUID().uuidString.lowercased()
        let url = temporaryRoot.appendingPathComponent(id).appendingPathExtension("m4a")
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
        let created = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ])
        created.delegate = self
        created.isMeteringEnabled = true
        let beganRecording = if let maximumDurationMilliseconds, maximumDurationMilliseconds > 0 {
            created.prepareToRecord() && created.record(forDuration: Double(maximumDurationMilliseconds) / 1_000)
        } else {
            created.prepareToRecord() && created.record()
        }
        guard beganRecording else { throw NSError(domain: "JournalAudio", code: 2) }
        recorder = created
        startedAt = Date()
        try machine.start(id: id, temporaryURL: url)
        try persistRecovery()
        return status()
    }

    public func status() -> JournalRecordingSnapshot {
        var value = machine.snapshot
        if let recorder { value.elapsedMilliseconds = Int(recorder.currentTime * 1_000) }
        return value
    }

    public func currentPowerLevel() -> Float {
        guard let source = recorder?.isRecording == true ? recorder : monitorRecorder,
              source.isRecording else { return 0 }
        source.updateMeters()
        let decibels = source.averagePower(forChannel: 0)
        guard decibels.isFinite else { return 0 }
        let linearLevel = min(1, max(0, (decibels + 60) / 60))
        return pow(linearLevel, 0.55)
    }

    public func startMonitoring() async throws {
        guard recorder == nil, monitorRecorder == nil else { return }
        monitoringGeneration += 1
        let requestedGeneration = monitoringGeneration
        let granted: Bool
        if #available(iOS 17.0, *) {
            granted = await AVAudioApplication.requestRecordPermission()
        } else {
            granted = await withCheckedContinuation { continuation in
                session.requestRecordPermission { continuation.resume(returning: $0) }
            }
        }
        guard granted else { throw NSError(domain: "JournalAudio", code: 1, userInfo: ["code": "PERMISSION_DENIED"]) }
        // Permission requests suspend this MainActor method. A recording or a
        // newer monitoring request may have started while it was suspended.
        guard requestedGeneration == monitoringGeneration,
              recorder == nil,
              monitorRecorder == nil else { return }
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
        let url = temporaryRoot
            .appendingPathComponent("microphone-monitor-\(UUID().uuidString)")
            .appendingPathExtension("m4a")
        let created = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 22_050,
            AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.min.rawValue
        ])
        created.isMeteringEnabled = true
        guard created.prepareToRecord(), created.record() else { throw NSError(domain: "JournalAudio", code: 2) }
        monitorURL = url
        monitorRecorder = created
    }

    public func stopMonitoring() {
        monitoringGeneration += 1
        monitorRecorder?.stop()
        monitorRecorder = nil
        if let monitorURL { try? fileManager.removeItem(at: monitorURL) }
        monitorURL = nil
        if recorder == nil { try? session.setActive(false, options: .notifyOthersOnDeactivation) }
    }

    public func pause() throws -> JournalRecordingSnapshot {
        guard let recorder, recorder.isRecording else { throw RecordingTransitionError.invalidTransition }
        recorder.pause()
        try machine.pause(elapsedMilliseconds: Int(recorder.currentTime * 1_000))
        try persistRecovery()
        return status()
    }

    public func resume() throws -> JournalRecordingSnapshot {
        guard machine.snapshot.state == .paused,
              let recorder else { throw RecordingTransitionError.invalidTransition }
        try session.setActive(true)
        guard recorder.record() else { throw RecordingTransitionError.invalidTransition }
        try machine.resume()
        try persistRecovery()
        return status()
    }

    public func stop() throws -> JournalRecordingSnapshot {
        if recorder == nil, machine.snapshot.state == .interrupted {
            try machine.finalise(elapsedMilliseconds: machine.snapshot.elapsedMilliseconds)
            try persistRecovery()
            return machine.snapshot
        }
        guard let recorder else { throw RecordingTransitionError.invalidTransition }
        let elapsed = Int(recorder.currentTime * 1_000)
        recorder.stop()
        self.recorder = nil
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        try machine.finalise(elapsedMilliseconds: elapsed)
        try persistRecovery()
        return machine.snapshot
    }

    public func acknowledgeSaved() throws -> JournalRecordingSnapshot {
        try machine.saved()
        try? fileManager.removeItem(at: recoveryURL)
        return machine.snapshot
    }

    public func recoverInterrupted() -> [JournalRecordingSnapshot] {
        guard let data = try? Data(contentsOf: recoveryURL),
              var snapshot = try? JSONDecoder().decode(JournalRecordingSnapshot.self, from: data),
              let url = snapshot.temporaryURL,
              fileManager.fileExists(atPath: url.path) else { return [] }
        if snapshot.state == .recording { snapshot.state = .interrupted }
        snapshot.message = "An unfinished recording was recovered after the app closed."
        machine.recover(snapshot)
        return [snapshot]
    }

    private func observeAudioSession() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(handleInterruption), name: AVAudioSession.interruptionNotification, object: session)
        center.addObserver(self, selector: #selector(handleRouteChange), name: AVAudioSession.routeChangeNotification, object: session)
    }

    @objc private func handleInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began, machine.snapshot.state == .recording {
            recorder?.pause()
            try? machine.interrupt(elapsedMilliseconds: Int((recorder?.currentTime ?? 0) * 1_000))
            try? persistRecovery()
        } else if type == .ended,
                  let rawOptions = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
                  AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume),
                  recorder?.record() == true {
            try? machine.resume()
            try? persistRecovery()
        }
    }

    @objc private func handleRouteChange(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable,
              machine.snapshot.state == .recording else { return }
        recorder?.pause()
        try? machine.interrupt(elapsedMilliseconds: Int((recorder?.currentTime ?? 0) * 1_000))
        try? persistRecovery()
    }

    private func persistRecovery() throws {
        let data = try JSONEncoder().encode(status())
        try data.write(to: recoveryURL, options: .atomic)
    }

    nonisolated public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        let message = error?.localizedDescription ?? "Recording failed."
        Task { @MainActor [weak self] in
            self?.machine.fail(message)
            try? self?.persistRecovery()
        }
    }

    nonisolated public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let elapsed = Int(recorder.currentTime * 1_000)
        Task { @MainActor [weak self] in
            guard let self, machine.snapshot.state == .recording else { return }
            self.recorder = nil
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            if flag {
                try? machine.finalise(elapsedMilliseconds: elapsed)
            } else {
                machine.fail("Recording stopped before it could be completed.")
            }
            try? persistRecovery()
        }
    }
}
#endif
