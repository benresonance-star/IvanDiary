import AVFoundation
@preconcurrency import Capacitor
@preconcurrency import CloudKit
import CryptoKit
import AppleAudioServices

private func recordingPayload(_ snapshot: JournalRecordingSnapshot) -> [String: Any] {
    var value: [String: Any] = [
        "id": snapshot.id,
        "state": snapshot.state.rawValue,
        "elapsedMs": snapshot.elapsedMilliseconds
    ]
    if let url = snapshot.temporaryURL { value["temporaryUri"] = url.absoluteString }
    if let message = snapshot.message { value["message"] = message }
    return value
}

@objc(CloudBackupPlugin)
@MainActor
public final class CloudBackupPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "CloudBackupPlugin"
    public let jsName = "CloudBackup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "backupSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "backupAssets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private let container = CKContainer.default()
    private var database: CKDatabase { container.privateCloudDatabase }
    private let snapshotRecordID = CKRecord.ID(recordName: "primary-journal-snapshot")
    private let containerIdentifier = "iCloud.au.com.myjournal.ivansdiary"

    private var locationPayload: JSObject {
        [
            "accountDescription": "Signed in to iCloud (Apple keeps the account name private)",
            "containerIdentifier": containerIdentifier,
            "databaseDescription": "Private CloudKit database",
            "recordIdentifier": snapshotRecordID.recordName
        ]
    }

    @objc public func status(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let accountStatus = try await container.accountStatus()
                guard accountStatus == .available else {
                    call.resolve(statusPayload(for: accountStatus))
                    return
                }
                do {
                    let record = try await database.record(for: snapshotRecordID)
                    var payload = locationPayload
                    let failed = record["failedAssetCount"] as? Int64 ?? 0
                    let expected = record["expectedAssetCount"] as? Int64
                    let uploaded = record["uploadedAssetCount"] as? Int64 ?? 0
                    let complete = expected != nil && failed == 0 && uploaded == expected
                    payload["state"] = complete ? "synced" : "available"
                    payload["message"] = complete ? "Diary information and all available files are backed up to iCloud." : "iCloud is connected. Some files may still need backup."
                    payload["uploadedItemCount"] = Int(uploaded)
                    payload["failedItemCount"] = Int(failed)
                    if let revision = record["revision"] as? Int64 { payload["backedUpRevision"] = Int(revision) }
                    if let modifiedAt = record.modificationDate {
                        payload["lastSuccessfulBackupAt"] = modifiedAt.iso8601String
                    }
                    call.resolve(payload)
                } catch let error as CKError where error.code == .unknownItem {
                    var payload = locationPayload
                    payload.merge(["state": "available", "message": "iCloud is connected and ready for the first backup."]) { _, new in new }
                    call.resolve(payload)
                }
            } catch {
                reject(call, error: error)
            }
        }
    }

    @objc public func backupSnapshot(_ call: CAPPluginCall) {
        guard let snapshotJSON = call.getString("snapshotJson"),
              let snapshotData = snapshotJSON.data(using: .utf8),
              let revision = call.getInt("revision") else {
            call.reject("A valid journal snapshot is required.", "INVALID_SNAPSHOT")
            return
        }
        Task { @MainActor in
            let temporaryURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("journal-snapshot-\(UUID().uuidString)")
                .appendingPathExtension("json")
            defer { try? FileManager.default.removeItem(at: temporaryURL) }
            do {
                guard try await container.accountStatus() == .available else {
                    call.reject("Sign in to iCloud before backing up.", "ACCOUNT_UNAVAILABLE")
                    return
                }
                try snapshotData.write(to: temporaryURL, options: .atomic)
                let record: CKRecord
                do {
                    record = try await database.record(for: snapshotRecordID)
                } catch let error as CKError where error.code == .unknownItem {
                    record = CKRecord(recordType: "IvanDiarySnapshot", recordID: snapshotRecordID)
                }
                record["snapshot"] = CKAsset(fileURL: temporaryURL)
                record["schemaVersion"] = 1 as CKRecordValue
                record["revision"] = revision as CKRecordValue
                record["deviceName"] = UIDevice.current.name as CKRecordValue
                let saved = try await database.save(record)
                var payload = locationPayload
                payload.merge([
                    "state": "synced",
                    "backedUpRevision": revision,
                    "lastSuccessfulBackupAt": (saved.modificationDate ?? Date()).iso8601String,
                    "message": "Diary information was backed up to iCloud. Large recordings, photos and drawings are not uploaded yet."
                ]) { _, new in new }
                call.resolve(payload)
            } catch {
                reject(call, error: error)
            }
        }
    }

    @objc public func backupAssets(_ call: CAPPluginCall) {
        guard let assets = call.getArray("assets", JSObject.self) else {
            call.reject("A list of backup assets is required.", "INVALID_ASSETS")
            return
        }
        Task { @MainActor in
            var uploaded = 0
            var unchanged = 0
            var failed = 0
            var failedItems: [JSObject] = []
            for asset in assets {
                do {
                    if try await saveAsset(asset) {
                        uploaded += 1
                    } else {
                        unchanged += 1
                    }
                } catch {
                    failed += 1
                    failedItems.append([
                        "id": asset["id"] as? String ?? "Unknown asset",
                        "kind": asset["kind"] as? String ?? "unknown",
                        "reason": backupFailureReason(error)
                    ])
                }
            }
            var payload = locationPayload
            payload["state"] = failed == 0 ? "synced" : "waiting"
            payload["uploadedItemCount"] = uploaded + unchanged
            payload["failedItemCount"] = failed
            payload["failedItems"] = failedItems
            payload["lastSuccessfulBackupAt"] = Date().iso8601String
            payload["message"] = failed == 0
                ? unchanged > 0
                    ? "Backup is current. \(unchanged) unchanged files did not need uploading."
                    : "Diary information and all available files were backed up to iCloud."
                : "\(uploaded) files were backed up. \(failed) files are still waiting."
            do {
                let snapshot = try await database.record(for: snapshotRecordID)
                snapshot["expectedAssetCount"] = assets.count as CKRecordValue
                snapshot["uploadedAssetCount"] = (uploaded + unchanged) as CKRecordValue
                snapshot["failedAssetCount"] = failed as CKRecordValue
                _ = try await database.save(snapshot)
            } catch {
                payload["state"] = "waiting"
                payload["message"] = "Files uploaded, but CloudKit could not confirm the completed backup."
            }
            call.resolve(payload)
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let snapshotRecord = try await database.record(for: snapshotRecordID)
                guard let snapshotAsset = snapshotRecord["snapshot"] as? CKAsset,
                      let snapshotURL = snapshotAsset.fileURL else { throw CocoaError(.fileNoSuchFile) }
                let snapshotJSON = try String(contentsOf: snapshotURL, encoding: .utf8)
                let query = CKQuery(recordType: "IvanDiaryAsset", predicate: NSPredicate(value: true))
                let (matches, _) = try await database.records(matching: query, resultsLimit: CKQueryOperation.maximumResults)
                var restoredURIs: JSObject = [:]
                for (_, result) in matches {
                    let record = try result.get()
                    guard let cloudAsset = record["asset"] as? CKAsset,
                          let source = cloudAsset.fileURL,
                          let assetID = record["assetID"] as? String,
                          let kind = record["kind"] as? String else { continue }
                    if kind == "audio" {
                        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                        let directory = root.appendingPathComponent("JournalAssets/OriginalAudio", isDirectory: true)
                        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                        let destination = directory.appendingPathComponent(assetID).appendingPathExtension("m4a")
                        if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                        try FileManager.default.copyItem(at: source, to: destination)
                        restoredURIs[assetID] = destination.absoluteString
                    } else if kind == "drawing", assetID.hasPrefix("drawing-") {
                        let documentID = String(assetID.dropFirst("drawing-".count))
                        let safeID = documentID.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
                        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                        let directory = root.appendingPathComponent("PencilDrawings", isDirectory: true)
                        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                        let destination = directory.appendingPathComponent(String(safeID)).appendingPathExtension("pkdrawing")
                        if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                        try FileManager.default.copyItem(at: source, to: destination)
                    }
                }
                var payload: JSObject = ["snapshotJson": snapshotJSON, "restoredAssetUris": restoredURIs]
                if let backedUpAt = snapshotRecord.modificationDate { payload["backedUpAt"] = backedUpAt.iso8601String }
                call.resolve(payload)
            } catch { reject(call, error: error) }
        }
    }

    private func backupFailureReason(_ error: Error) -> String {
        if let cloudError = error as? CKError {
            switch cloudError.code {
            case .networkUnavailable, .networkFailure:
                return "The network connection was unavailable. Try again."
            case .notAuthenticated:
                return "The iCloud account needs to sign in again."
            case .quotaExceeded:
                return "The iCloud account does not have enough available storage."
            case .requestRateLimited, .serviceUnavailable, .zoneBusy:
                return "iCloud is temporarily busy. Try again shortly."
            case .serverRecordChanged:
                return "The cloud copy changed during upload. Try again."
            default:
                return "CloudKit error \(cloudError.code.rawValue): \(cloudError.localizedDescription)"
            }
        }
        let cocoaError = error as NSError
        if cocoaError.domain == NSCocoaErrorDomain && cocoaError.code == CocoaError.fileNoSuchFile.rawValue {
            return "The original local file could not be found on this iPad."
        }
        if cocoaError.domain == NSCocoaErrorDomain && cocoaError.code == CocoaError.fileReadCorruptFile.rawValue {
            return "The local file could not be read."
        }
        return error.localizedDescription
    }

    /// Returns true only when CloudKit needed a new binary upload.
    private func saveAsset(_ asset: JSObject) async throws -> Bool {
        guard let id = asset["id"] as? String,
              let kind = asset["kind"] as? String,
              let mimeType = asset["mimeType"] as? String else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let resolved = try assetURL(asset, id: id, kind: kind)
        defer { if resolved.removeAfterUpload { try? FileManager.default.removeItem(at: resolved.url) } }
        let fingerprint: String
        if let checksum = asset["checksum"] as? String, !checksum.isEmpty {
            fingerprint = checksum
        } else {
            let digest = SHA256.hash(data: try Data(contentsOf: resolved.url))
            fingerprint = digest.map { String(format: "%02x", $0) }.joined()
        }
        let safeID = id.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
        let recordID = CKRecord.ID(recordName: "asset-\(String(safeID))")
        let record: CKRecord
        do {
            record = try await database.record(for: recordID)
            if record["checksum"] as? String == fingerprint,
               record["asset"] is CKAsset {
                return false
            }
        } catch let error as CKError where error.code == .unknownItem {
            record = CKRecord(recordType: "IvanDiaryAsset", recordID: recordID)
        }
        record["asset"] = CKAsset(fileURL: resolved.url)
        record["assetID"] = id as CKRecordValue
        record["kind"] = kind as CKRecordValue
        record["mimeType"] = mimeType as CKRecordValue
        record["checksum"] = fingerprint as CKRecordValue
        _ = try await database.save(record)
        return true
    }

    private func assetURL(_ asset: JSObject, id: String, kind: String) throws -> (url: URL, removeAfterUpload: Bool) {
        if kind == "drawing", let documentID = asset["drawingDocumentId"] as? String {
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let safeID = documentID.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
            let url = root.appendingPathComponent("PencilDrawings", isDirectory: true)
                .appendingPathComponent(String(safeID)).appendingPathExtension("pkdrawing")
            guard FileManager.default.fileExists(atPath: url.path) else { throw CocoaError(.fileNoSuchFile) }
            return (url, false)
        }
        guard let uri = asset["localUri"] as? String else { throw CocoaError(.fileNoSuchFile) }
        if let url = URL(string: uri), url.isFileURL, FileManager.default.fileExists(atPath: url.path) {
            return (url, false)
        }
        if kind == "audio" {
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let fallback = root.appendingPathComponent("JournalAssets", isDirectory: true)
                .appendingPathComponent("OriginalAudio", isDirectory: true)
                .appendingPathComponent(id).appendingPathExtension("m4a")
            if FileManager.default.fileExists(atPath: fallback.path) {
                return (fallback, false)
            }
        }
        if uri.hasPrefix("data:"), let separator = uri.firstIndex(of: ",") {
            let encoded = String(uri[uri.index(after: separator)...])
            guard let data = Data(base64Encoded: encoded) else { throw CocoaError(.fileReadCorruptFile) }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("cloud-asset-\(id)")
            try data.write(to: url, options: .atomic)
            return (url, true)
        }
        throw CocoaError(.fileNoSuchFile)
    }

    private func statusPayload(for status: CKAccountStatus) -> JSObject {
        switch status {
        case .noAccount:
            return ["state": "no-account", "message": "Sign in to iCloud in iPad Settings to enable backup."]
        case .restricted:
            return ["state": "restricted", "message": "iCloud access is restricted on this iPad."]
        case .couldNotDetermine:
            return ["state": "error", "message": "The iCloud connection could not be checked."]
        case .temporarilyUnavailable:
            return ["state": "waiting", "message": "iCloud is temporarily unavailable. The diary remains saved on this iPad."]
        case .available:
            return ["state": "available", "message": "iCloud is connected."]
        @unknown default:
            return ["state": "error", "message": "The iCloud account status is unknown."]
        }
    }

    private func reject(_ call: CAPPluginCall, error: Error) {
        let cloudError = error as? CKError
        call.reject(
            cloudError?.localizedDescription ?? "iCloud backup failed.",
            cloudError.map { "CLOUDKIT_\($0.code.rawValue)" } ?? "CLOUDKIT_FAILURE",
            error
        )
    }
}

private extension Date {
    var iso8601String: String { ISO8601DateFormatter().string(from: self) }
}

@objc(JournalAudioPlugin)
@MainActor
public final class JournalAudioPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin, @preconcurrency AVAudioPlayerDelegate {
    public let identifier = "JournalAudioPlugin"
    public let jsName = "JournalAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeSaved", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverInterrupted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pausePlayback", returnType: CAPPluginReturnPromise)
    ]
    private lazy var recorder = try? JournalAudioRecorder()
    private var player: AVAudioPlayer?
    private var playerAssetURI: String?

    @objc public func start(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let recorder else { call.reject("Audio recording is unavailable.", "UNAVAILABLE"); return }
            let maximumDuration = call.getInt("maximumDurationMs")
            do { call.resolve(recordingPayload(try await recorder.start(maximumDurationMilliseconds: maximumDuration))) }
            catch { reject(call, error: error, fallback: "Recording could not start.") }
        }
    }

    @objc public func status(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let recorder else { call.reject("Audio recording is unavailable.", "UNAVAILABLE"); return }
            call.resolve(recordingPayload(recorder.status()))
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let recorder else { call.reject("Audio recording is unavailable.", "UNAVAILABLE"); return }
            do { call.resolve(recordingPayload(try recorder.stop())) }
            catch { reject(call, error: error, fallback: "Recording could not be closed.") }
        }
    }

    @objc public func acknowledgeSaved(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let recorder else { call.reject("Audio recording is unavailable.", "UNAVAILABLE"); return }
            do { call.resolve(recordingPayload(try recorder.acknowledgeSaved())) }
            catch { reject(call, error: error, fallback: "Recording state could not be saved.") }
        }
    }

    @objc public func recoverInterrupted(_ call: CAPPluginCall) {
        Task { @MainActor in
            let recordings = recorder?.recoverInterrupted().map(recordingPayload) ?? []
            call.resolve(["recordings": recordings])
        }
    }

    @objc public func play(_ call: CAPPluginCall) {
        guard let uri = call.getString("assetUri"), let requestedURL = URL(string: uri), requestedURL.isFileURL else {
            call.reject("A finalized file asset is required.", "ASSET_MISSING"); return
        }
        Task { @MainActor in
            do {
                notifyPlaybackEnded()
                let url = try resolvedAudioURL(requestedURL)
                let player = try AVAudioPlayer(contentsOf: url)
                player.delegate = self
                if let startMs = call.getInt("startMs") {
                    player.currentTime = Double(startMs) / 1_000
                }
                guard player.prepareToPlay(), player.play() else { throw CocoaError(.fileReadUnknown) }
                self.player = player
                self.playerAssetURI = uri
                if let durationMs = call.getInt("durationMs"), durationMs > 0 {
                    Task { @MainActor [weak self, weak player] in
                        try? await Task.sleep(nanoseconds: UInt64(durationMs) * 1_000_000)
                        guard self?.player === player else { return }
                        player?.pause()
                        self?.notifyPlaybackEnded()
                    }
                }
                call.resolve(["playing": true])
            } catch { reject(call, error: error, fallback: "The recording could not be played.") }
        }
    }

    private func resolvedAudioURL(_ requestedURL: URL) throws -> URL {
        if FileManager.default.fileExists(atPath: requestedURL.path) {
            return requestedURL
        }
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let fallback = support
            .appendingPathComponent("JournalAssets", isDirectory: true)
            .appendingPathComponent("OriginalAudio", isDirectory: true)
            .appendingPathComponent(requestedURL.lastPathComponent)
        guard FileManager.default.fileExists(atPath: fallback.path) else {
            throw CocoaError(.fileNoSuchFile)
        }
        return fallback
    }

    @objc public func pausePlayback(_ call: CAPPluginCall) {
        Task { @MainActor in
            player?.pause()
            player = nil
            playerAssetURI = nil
            call.resolve(["playing": false])
        }
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        notifyPlaybackEnded()
    }

    private func notifyPlaybackEnded() {
        guard let assetURI = playerAssetURI else { return }
        player?.stop()
        player = nil
        playerAssetURI = nil
        notifyListeners("playbackEnded", data: ["assetUri": assetURI])
    }

    private func reject(_ call: CAPPluginCall, error: Error, fallback: String) {
        let nsError = error as NSError
        let code = nsError.userInfo["code"] as? String ?? "NATIVE_FAILURE"
        call.reject(nsError.localizedDescription.isEmpty ? fallback : nsError.localizedDescription, code, error)
    }
}

@objc(AppleTranscriptionPlugin)
@MainActor
public final class AppleTranscriptionPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "AppleTranscriptionPlugin"
    public let jsName = "AppleTranscription"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribe", returnType: CAPPluginReturnPromise)
    ]
    private lazy var transcriber = AppleSpeechTranscriber()

    @objc public func requestPermission(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(["granted": await transcriber.requestPermission()])
        }
    }

    @objc public func transcribe(_ call: CAPPluginCall) {
        guard let recordingID = call.getString("recordingId"),
              let asset = call.getObject("asset"),
              let uri = asset["localUri"] as? String,
              let fileURL = URL(string: uri), fileURL.isFileURL else {
            call.reject("A finalized recording is required.", "ASSET_MISSING")
            return
        }
        let locale = call.getString("locale") ?? "en-AU"
        let contextualStrings = call.getArray("contextualStrings", String.self) ?? []
        Task { @MainActor in
            do {
                let result = try await transcriber.transcribe(fileURL: fileURL, localeIdentifier: locale, contextualStrings: contextualStrings)
                call.resolve([
                    "recordingId": recordingID,
                    "rawText": result.text,
                    "locale": result.locale,
                    "engine": "apple-speech",
                    "segments": result.segments.map {
                        ["text": $0.text, "startMs": $0.startMilliseconds, "durationMs": $0.durationMilliseconds,
                         "confidence": $0.confidence, "alternatives": $0.alternatives]
                    }
                ])
            } catch let error as AppleSpeechTranscriptionError {
                call.reject(error.localizedDescription, error.code, error)
            } catch {
                call.reject("The recording could not be transcribed.", "NATIVE_FAILURE", error)
            }
        }
    }
}

@objc(JournalFilesPlugin)
@MainActor
public final class JournalFilesPlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "JournalFilesPlugin"
    public let jsName = "JournalFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "finaliseTemporaryAsset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeToTrash", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageHealth", returnType: CAPPluginReturnPromise)
    ]
    private lazy var store = try? JournalFileStore()

    @objc public func finaliseTemporaryAsset(_ call: CAPPluginCall) {
        guard let temporaryURI = call.getString("temporaryUri"),
              let temporaryURL = URL(string: temporaryURI), temporaryURL.isFileURL,
              let assetID = call.getString("assetId"), !assetID.isEmpty,
              let mimeType = call.getString("mimeType"),
              let store else { call.reject("Valid finalization details are required.", "ASSET_MISSING"); return }
        do {
            let asset = try store.finalize(temporaryURL: temporaryURL, assetID: assetID, mimeType: mimeType)
            call.resolve(["id": asset.id, "localUri": asset.url.absoluteString, "mimeType": asset.mimeType,
                          "byteLength": asset.byteLength, "checksum": asset.checksum])
        } catch { call.reject("The original recording could not be finalized.", "NATIVE_FAILURE", error) }
    }

    @objc public func removeToTrash(_ call: CAPPluginCall) {
        guard let assetID = call.getString("assetId"), let store else { call.reject("An asset ID is required."); return }
        do { try store.moveToTrash(assetID: assetID); call.resolve() }
        catch { call.reject("The recording could not be moved to recoverable trash.", "NATIVE_FAILURE", error) }
    }

    @objc public func storageHealth(_ call: CAPPluginCall) {
        guard let health = store?.storageHealth() else { call.reject("Storage status is unavailable.", "UNAVAILABLE"); return }
        var result: [String: Any] = ["lowStorage": health.lowStorage]
        if let bytes = health.availableBytes { result["availableBytes"] = bytes }
        call.resolve(result)
    }
}
