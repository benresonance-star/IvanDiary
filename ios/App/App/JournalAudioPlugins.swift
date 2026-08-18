import AVFoundation
@preconcurrency import Capacitor
@preconcurrency import CloudKit
import CryptoKit
import AppleAudioServices
import AppleDrawingKit
import PencilKit
import UniformTypeIdentifiers
import UIKit
import WebKit

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
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restoreHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteCloudData", returnType: CAPPluginReturnPromise)
    ]

    private let container = CKContainer.default()
    private var database: CKDatabase { container.privateCloudDatabase }
    private let snapshotRecordID = CKRecord.ID(recordName: "primary-journal-snapshot")
    private let historyIndexRecordID = CKRecord.ID(recordName: "history-index")
    private let containerIdentifier = "iCloud.au.com.myjournal.ivansdiary"

    private var locationPayload: JSObject {
        [
            "accountDescription": "Signed in to iCloud (Apple keeps the account name private)",
            "containerIdentifier": containerIdentifier,
            "databaseDescription": "Private CloudKit database",
            "recordIdentifier": snapshotRecordID.recordName,
            "currentDeviceName": UIDevice.current.name,
            "currentDeviceIdentifier": UIDevice.current.identifierForVendor?.uuidString ?? UIDevice.current.name
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
                    if let deviceName = record["deviceName"] as? String { payload["backupDeviceName"] = deviceName }
                    if let deviceIdentifier = record["deviceIdentifier"] as? String { payload["backupDeviceIdentifier"] = deviceIdentifier }
                    if let contentFingerprint = record["contentFingerprint"] as? String { payload["contentFingerprint"] = contentFingerprint }
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
              let revision = call.getInt("revision"),
              let contentFingerprint = call.getString("contentFingerprint") else {
            call.reject("A valid journal snapshot is required.", "INVALID_SNAPSHOT")
            return
        }
        Task { @MainActor in
            let expectedCloudFingerprint = call.getString("expectedCloudFingerprint")
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
                var record: CKRecord
                do {
                    record = try await database.record(for: snapshotRecordID)
                    if let expectedCloudFingerprint,
                       record["contentFingerprint"] as? String != expectedCloudFingerprint {
                        throw NSError(
                            domain: "IvanDiaryCloudBackup",
                            code: 2,
                            userInfo: [NSLocalizedDescriptionKey: "The iCloud diary changed on another iPad before this backup completed."]
                        )
                    }
                } catch let error as CKError where error.code == .unknownItem {
                    record = CKRecord(recordType: "IvanDiarySnapshot", recordID: snapshotRecordID)
                }
                record["snapshot"] = CKAsset(fileURL: temporaryURL)
                record["schemaVersion"] = 1 as CKRecordValue
                record["revision"] = revision as CKRecordValue
                record["deviceName"] = UIDevice.current.name as CKRecordValue
                record["deviceIdentifier"] = (UIDevice.current.identifierForVendor?.uuidString ?? UIDevice.current.name) as CKRecordValue
                record["contentFingerprint"] = contentFingerprint as CKRecordValue
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
                let expectedAssetIDs = assets.compactMap { $0["id"] as? String }
                var knownAssetRecordNames = Set(
                    snapshot["knownAssetRecordNames"] as? [String] ?? []
                )
                knownAssetRecordNames.formUnion(expectedAssetIDs.map {
                    "asset-\(safeFileName($0))"
                })
                snapshot["expectedAssetCount"] = assets.count as CKRecordValue
                snapshot["expectedAssetIDs"] = expectedAssetIDs as CKRecordValue
                snapshot["knownAssetRecordNames"] = knownAssetRecordNames.sorted() as CKRecordValue
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
                let referencedAssetIDs = try requiredAssetIDs(in: snapshotJSON)
                let expectedAssetIDs = snapshotRecord["expectedAssetIDs"] as? [String]
                if let expectedAssetIDs {
                    let failed = snapshotRecord["failedAssetCount"] as? Int64 ?? 0
                    let uploaded = snapshotRecord["uploadedAssetCount"] as? Int64 ?? -1
                    guard failed == 0, uploaded == Int64(expectedAssetIDs.count) else {
                        throw NSError(
                            domain: "IvanDiaryCloudRestore",
                            code: 1,
                            userInfo: [NSLocalizedDescriptionKey: "The latest iCloud backup is incomplete."]
                        )
                    }
                }
                var restoredURIs: JSObject = [:]
                let supportRoot = try FileManager.default.url(
                    for: .applicationSupportDirectory,
                    in: .userDomainMask,
                    appropriateFor: nil,
                    create: true
                )
                let requestedAssetIDs: Set<String>
                let exactAssetIDs: Set<String>
                if let expectedAssetIDs {
                    exactAssetIDs = Set(expectedAssetIDs)
                    requestedAssetIDs = exactAssetIDs.union(
                        referencedAssetIDs.filter { !$0.hasPrefix("drawing-") }
                    )
                } else {
                    exactAssetIDs = []
                    requestedAssetIDs = referencedAssetIDs.union([
                        "drawing-profile-portrait-drawing",
                        "drawing-welcome-screen-drawing"
                    ])
                }
                for assetID in requestedAssetIDs {
                    let safeRecordID = assetID.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
                    let record: CKRecord
                    do {
                        record = try await database.record(
                            for: CKRecord.ID(recordName: "asset-\(String(safeRecordID))")
                        )
                    } catch let error as CKError where error.code == .unknownItem {
                        if exactAssetIDs.contains(assetID) {
                            throw NSError(
                                domain: "IvanDiaryCloudRestore",
                                code: 2,
                                userInfo: [NSLocalizedDescriptionKey: "The iCloud backup is missing \(assetID)."]
                            )
                        }
                        // Older backups did not record an exact asset manifest.
                        // Reconciliation below still rejects missing media.
                        continue
                    }
                    guard let kind = record["kind"] as? String,
                          record["assetID"] as? String == assetID else {
                        if exactAssetIDs.contains(assetID) { throw CocoaError(.fileReadCorruptFile) }
                        continue
                    }
                    guard let cloudAsset = record["asset"] as? CKAsset,
                          let source = cloudAsset.fileURL else {
                        if exactAssetIDs.contains(assetID) { throw CocoaError(.fileNoSuchFile) }
                        continue
                    }
                    let safeAssetID = safeFileName(assetID)
                    guard !safeAssetID.isEmpty else { continue }
                    if kind == "audio" {
                        let directory = supportRoot.appendingPathComponent("JournalAssets/OriginalAudio", isDirectory: true)
                        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                        let destination = directory.appendingPathComponent(safeAssetID).appendingPathExtension("m4a")
                        try restoreAsset(from: source, to: destination)
                        restoredURIs[assetID] = destination.absoluteString
                    } else if kind == "photo" {
                        let mimeType = record["mimeType"] as? String
                        let directory = supportRoot.appendingPathComponent("JournalAssets/OriginalFiles", isDirectory: true)
                        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                        let destination = directory
                            .appendingPathComponent(safeAssetID)
                            .appendingPathExtension(fileExtension(for: mimeType, source: source))
                        try restoreAsset(from: source, to: destination)
                        restoredURIs[assetID] = destination.absoluteString
                    } else if kind == "drawing", assetID.hasPrefix("drawing-") {
                        let documentID = String(assetID.dropFirst("drawing-".count))
                        let safeID = safeFileName(documentID)
                        let directory = supportRoot.appendingPathComponent("PencilDrawings", isDirectory: true)
                        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                        let destination = directory.appendingPathComponent(safeID).appendingPathExtension("pkdrawing")
                        try restoreAsset(from: source, to: destination)
                    }
                }
                var payload: JSObject = ["snapshotJson": snapshotJSON, "restoredAssetUris": restoredURIs]
                if let backedUpAt = snapshotRecord.modificationDate { payload["backedUpAt"] = backedUpAt.iso8601String }
                call.resolve(payload)
            } catch { reject(call, error: error) }
        }
    }

    @objc public func listHistory(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let records: [CKRecord]
                do {
                    let index = try await database.record(for: historyIndexRecordID)
                    let recordNames = index["recordNames"] as? [String] ?? []
                    records = await historyRecords(named: recordNames)
                } catch let error as CKError where error.code == .unknownItem {
                    // One-time migration path for history created before the
                    // deterministic index existed. This requires the development
                    // schema's recordName query index to be enabled.
                    records = try await allRecords(recordType: "IvanDiaryHistory")
                    try await saveHistoryIndex(recordNames: records.map(\.recordID.recordName))
                }
                let retainedRecords = retainedHistoryRecords(from: records)
                let discardedNames = Set(records.map(\.recordID.recordName))
                    .subtracting(retainedRecords.map(\.recordID.recordName))
                if !discardedNames.isEmpty {
                    await deleteHistoryRecords(named: discardedNames)
                }
                let entries = retainedRecords.compactMap(historyPayload).sorted {
                    ($0["capturedAt"] as? String ?? "") > ($1["capturedAt"] as? String ?? "")
                }
                call.resolve(["entries": entries])
            } catch { reject(call, error: error) }
        }
    }

    @objc public func createHistory(_ call: CAPPluginCall) {
        guard let snapshotJSON = call.getString("snapshotJson"),
              let snapshotData = snapshotJSON.data(using: .utf8),
              let revision = call.getInt("revision"),
              let entryDay = call.getString("entryDay"),
              let timeZoneIdentifier = call.getString("timeZoneIdentifier"),
              let reason = call.getString("reason"),
              let assets = call.getArray("assets", JSObject.self) else {
            call.reject("A valid recovery point is required.", "INVALID_HISTORY")
            return
        }
        Task { @MainActor in
            let temporaryRoot = FileManager.default.temporaryDirectory
                .appendingPathComponent("journal-history-\(UUID().uuidString)", isDirectory: true)
            defer { try? FileManager.default.removeItem(at: temporaryRoot) }
            do {
                guard try await container.accountStatus() == .available else {
                    call.reject("Sign in to iCloud before creating history.", "ACCOUNT_UNAVAILABLE")
                    return
                }
                try FileManager.default.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
                let snapshotURL = temporaryRoot.appendingPathComponent("snapshot.json")
                try snapshotData.write(to: snapshotURL, options: .atomic)
                var manifest: [[String: Any]] = []
                var totalBytes: Int64 = Int64(snapshotData.count)
                for asset in assets {
                    let saved = try await saveHistoryBlob(asset)
                    manifest.append(saved.descriptor)
                    totalBytes += saved.byteLength
                }
                let manifestURL = temporaryRoot.appendingPathComponent("manifest.json")
                try JSONSerialization.data(withJSONObject: manifest).write(to: manifestURL, options: .atomic)
                let recordID = CKRecord.ID(recordName: "history-\(UUID().uuidString.lowercased())")
                let record = CKRecord(recordType: "IvanDiaryHistory", recordID: recordID)
                let capturedAt = Date()
                record["snapshot"] = CKAsset(fileURL: snapshotURL)
                record["manifest"] = CKAsset(fileURL: manifestURL)
                record["capturedAt"] = capturedAt as CKRecordValue
                record["entryDay"] = entryDay as CKRecordValue
                record["timeZoneIdentifier"] = timeZoneIdentifier as CKRecordValue
                record["reason"] = reason as CKRecordValue
                record["deviceName"] = UIDevice.current.name as CKRecordValue
                record["revision"] = revision as CKRecordValue
                record["assetCount"] = assets.count as CKRecordValue
                record["byteLength"] = totalBytes as CKRecordValue
                record["protected"] = 0 as CKRecordValue
                let blobRecordNames = manifest.compactMap {
                    $0["blobRecordName"] as? String
                }
                record["blobRecordNames"] = blobRecordNames as CKRecordValue
                let saved = try await database.save(record)
                try await addToHistoryIndex(
                    saved.recordID.recordName,
                    blobRecordNames: blobRecordNames
                )
                // Retention is maintenance: a temporary query/index failure must not
                // turn an already completed recovery point into a reported failure.
                // A before-restore point must coexist briefly with the selected
                // same-day point. Pruning here could delete the restore target
                // before restoreHistory has had a chance to read it.
                if reason != "before-restore" {
                    try? await pruneHistory()
                }
                guard let payload = historyPayload(saved) else { throw CocoaError(.fileReadCorruptFile) }
                call.resolve(["entry": payload])
            } catch { reject(call, error: error) }
        }
    }

    @objc public func restoreHistory(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), id.hasPrefix("history-") else {
            call.reject("A valid recovery point is required.", "INVALID_HISTORY")
            return
        }
        Task { @MainActor in
            let stagingRoot = FileManager.default.temporaryDirectory
                .appendingPathComponent("journal-history-restore-\(UUID().uuidString)", isDirectory: true)
            defer { try? FileManager.default.removeItem(at: stagingRoot) }
            do {
                try FileManager.default.createDirectory(at: stagingRoot, withIntermediateDirectories: true)
                let record = try await database.record(for: CKRecord.ID(recordName: id))
                guard let snapshotAsset = record["snapshot"] as? CKAsset,
                      let snapshotURL = snapshotAsset.fileURL,
                      let manifestAsset = record["manifest"] as? CKAsset,
                      let manifestURL = manifestAsset.fileURL,
                      let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [[String: Any]] else {
                    throw CocoaError(.fileReadCorruptFile)
                }
                let snapshotJSON = try String(contentsOf: snapshotURL, encoding: .utf8)
                var restoredURIs: JSObject = [:]
                var stagedAssets: [(URL, String, String, String?)] = []
                for descriptor in manifest {
                    guard let assetID = descriptor["id"] as? String,
                          let kind = descriptor["kind"] as? String,
                          let blobRecordName = descriptor["blobRecordName"] as? String else { throw CocoaError(.fileReadCorruptFile) }
                    let blob = try await database.record(for: CKRecord.ID(recordName: blobRecordName))
                    guard let cloudAsset = blob["asset"] as? CKAsset, let source = cloudAsset.fileURL else { throw CocoaError(.fileNoSuchFile) }
                    let stagedURL = stagingRoot.appendingPathComponent(UUID().uuidString)
                    try FileManager.default.copyItem(at: source, to: stagedURL)
                    let stagedData = try Data(contentsOf: stagedURL, options: .mappedIfSafe)
                    let checksum = SHA256.hash(data: stagedData).map { String(format: "%02x", $0) }.joined()
                    guard checksum == descriptor["checksum"] as? String else { throw CocoaError(.fileReadCorruptFile) }
                    stagedAssets.append((stagedURL, assetID, kind, descriptor["mimeType"] as? String))
                }
                for (source, assetID, kind, mimeType) in stagedAssets {
                    try restoreHistoryAsset(from: source, assetID: assetID, kind: kind, mimeType: mimeType, restoredURIs: &restoredURIs)
                }
                call.resolve([
                    "snapshotJson": snapshotJSON,
                    "restoredAssetUris": restoredURIs,
                    "backedUpAt": (record["capturedAt"] as? Date ?? record.creationDate ?? Date()).iso8601String
                ])
            } catch { reject(call, error: error) }
        }
    }

    @objc public func deleteHistory(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), id.hasPrefix("history-") else {
            call.reject("A valid recovery point is required.", "INVALID_HISTORY")
            return
        }
        Task { @MainActor in
            do {
                _ = try await database.deleteRecord(withID: CKRecord.ID(recordName: id))
                try await removeFromHistoryIndex([id])
                try? await garbageCollectHistoryBlobs()
                call.resolve()
            } catch { reject(call, error: error) }
        }
    }

    @objc public func deleteCloudData(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                var recordNames = Set<String>([
                    snapshotRecordID.recordName,
                    historyIndexRecordID.recordName
                ])
                if let snapshot = try? await database.record(for: snapshotRecordID) {
                    recordNames.formUnion(
                        snapshot["knownAssetRecordNames"] as? [String] ?? []
                    )
                    let expectedIDs = snapshot["expectedAssetIDs"] as? [String] ?? []
                    recordNames.formUnion(expectedIDs.map {
                        "asset-\(safeFileName($0))"
                    })
                }
                if let index = try? await database.record(for: historyIndexRecordID) {
                    let historyNames = index["recordNames"] as? [String] ?? []
                    let historyRecords = await historyRecords(named: historyNames)
                    recordNames.formUnion(historyNames)
                    recordNames.formUnion(index["blobRecordNames"] as? [String] ?? [])
                    for record in historyRecords {
                        recordNames.formUnion(historyBlobRecordNames(record))
                    }
                }
                var failures: [String] = []
                for name in recordNames {
                    do {
                        _ = try await database.deleteRecord(
                            withID: CKRecord.ID(recordName: name)
                        )
                    } catch let error as CKError where error.code == .unknownItem {
                        continue
                    } catch {
                        failures.append(name)
                    }
                }
                guard failures.isEmpty else {
                    throw NSError(
                        domain: "IvanDiaryCloudDeletion",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Some iCloud records could not be deleted. Try again."]
                    )
                }
                call.resolve()
            } catch { reject(call, error: error) }
        }
    }

    private func historyPayload(_ record: CKRecord) -> JSObject? {
        guard let capturedAt = record["capturedAt"] as? Date,
              let entryDay = record["entryDay"] as? String,
              let reason = record["reason"] as? String else { return nil }
        return [
            "id": record.recordID.recordName,
            "capturedAt": capturedAt.iso8601String,
            "entryDay": entryDay,
            "reason": reason,
            "deviceName": record["deviceName"] as? String ?? "iPad",
            "revision": Int(record["revision"] as? Int64 ?? 0),
            "assetCount": Int(record["assetCount"] as? Int64 ?? 0),
            "byteLength": Int(record["byteLength"] as? Int64 ?? 0),
            "protected": false
        ]
    }

    private func historyRecords(named recordNames: [String]) async -> [CKRecord] {
        var records: [CKRecord] = []
        for name in recordNames where name.hasPrefix("history-") {
            if let record = try? await database.record(for: CKRecord.ID(recordName: name)) {
                records.append(record)
            }
        }
        return records
    }

    private func saveHistoryIndex(recordNames: [String]) async throws {
        let index: CKRecord
        do {
            index = try await database.record(for: historyIndexRecordID)
        } catch let error as CKError where error.code == .unknownItem {
            index = CKRecord(recordType: "IvanDiaryHistoryIndex", recordID: historyIndexRecordID)
        }
        index["recordNames"] = Array(Set(recordNames)).sorted() as CKRecordValue
        _ = try await database.save(index)
    }

    private func addToHistoryIndex(
        _ recordName: String,
        blobRecordNames: [String] = []
    ) async throws {
        let index: CKRecord
        do {
            index = try await database.record(for: historyIndexRecordID)
        } catch let error as CKError where error.code == .unknownItem {
            index = CKRecord(recordType: "IvanDiaryHistoryIndex", recordID: historyIndexRecordID)
        }
        var names = Set(index["recordNames"] as? [String] ?? [])
        names.insert(recordName)
        index["recordNames"] = names.sorted() as CKRecordValue
        var blobs = Set(index["blobRecordNames"] as? [String] ?? [])
        blobs.formUnion(blobRecordNames)
        index["blobRecordNames"] = blobs.sorted() as CKRecordValue
        _ = try await database.save(index)
    }

    private func removeFromHistoryIndex(_ recordNames: Set<String>) async throws {
        guard let index = try? await database.record(for: historyIndexRecordID) else { return }
        let names = Set(index["recordNames"] as? [String] ?? []).subtracting(recordNames)
        index["recordNames"] = names.sorted() as CKRecordValue
        _ = try await database.save(index)
    }

    private func allRecords(
        recordType: String,
        toleratingIndividualErrors: Bool = false
    ) async throws -> [CKRecord] {
        let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
        var records: [CKRecord] = []
        var (matches, cursor) = try await database.records(matching: query, resultsLimit: CKQueryOperation.maximumResults)
        while true {
            if toleratingIndividualErrors {
                records.append(contentsOf: matches.compactMap { try? $0.1.get() })
            } else {
                records.append(contentsOf: try matches.map { try $0.1.get() })
            }
            guard let currentCursor = cursor else { break }
            (matches, cursor) = try await database.records(continuingMatchFrom: currentCursor, resultsLimit: CKQueryOperation.maximumResults)
        }
        return records
    }

    private func requiredAssetIDs(in snapshotJSON: String) throws -> Set<String> {
        guard let data = snapshotJSON.data(using: .utf8) else { throw CocoaError(.fileReadCorruptFile) }
        let root = try JSONSerialization.jsonObject(with: data)
        var identifiers = Set<String>()
        func visit(_ value: Any) {
            if let dictionary = value as? [String: Any] {
                if dictionary["localUri"] is String, let id = dictionary["id"] as? String {
                    identifiers.insert(id)
                }
                if let drawingID = dictionary["drawingDocumentId"] as? String {
                    identifiers.insert("drawing-\(drawingID)")
                }
                dictionary.values.forEach(visit)
            } else if let array = value as? [Any] {
                array.forEach(visit)
            }
        }
        visit(root)
        return identifiers
    }

    private func saveHistoryBlob(_ asset: JSObject) async throws -> (descriptor: [String: Any], byteLength: Int64) {
        guard let id = asset["id"] as? String,
              let kind = asset["kind"] as? String,
              let mimeType = asset["mimeType"] as? String else { throw CocoaError(.fileReadCorruptFile) }
        let resolved = try assetURL(asset, id: id, kind: kind)
        defer { if resolved.removeAfterUpload { try? FileManager.default.removeItem(at: resolved.url) } }
        let sourceURL = resolved.url
        let (digest, byteLength) = try await Task.detached(priority: .utility) {
            let data = try Data(contentsOf: sourceURL, options: .mappedIfSafe)
            return (SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), data.count)
        }.value
        let recordID = CKRecord.ID(recordName: "history-blob-\(digest)")
        do {
            _ = try await database.record(for: recordID)
        } catch let error as CKError where error.code == .unknownItem {
            let blob = CKRecord(recordType: "IvanDiaryHistoryBlob", recordID: recordID)
            blob["asset"] = CKAsset(fileURL: resolved.url)
            blob["checksum"] = digest as CKRecordValue
            blob["byteLength"] = byteLength as CKRecordValue
            _ = try await database.save(blob)
        }
        return ([
            "id": id,
            "kind": kind,
            "mimeType": mimeType,
            "checksum": digest,
            "blobRecordName": recordID.recordName
        ], Int64(byteLength))
    }

    private func restoreHistoryAsset(from source: URL, assetID: String, kind: String, mimeType: String?, restoredURIs: inout JSObject) throws {
        let supportRoot = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let safeID = safeFileName(kind == "drawing" && assetID.hasPrefix("drawing-") ? String(assetID.dropFirst("drawing-".count)) : assetID)
        let directory: URL
        let destination: URL
        if kind == "drawing" {
            directory = supportRoot.appendingPathComponent("PencilDrawings", isDirectory: true)
            destination = directory.appendingPathComponent(safeID).appendingPathExtension("pkdrawing")
        } else if kind == "audio" {
            directory = supportRoot.appendingPathComponent("JournalAssets/OriginalAudio", isDirectory: true)
            destination = directory.appendingPathComponent(safeID).appendingPathExtension("m4a")
        } else {
            directory = supportRoot.appendingPathComponent("JournalAssets/OriginalFiles", isDirectory: true)
            destination = directory.appendingPathComponent(safeID).appendingPathExtension(fileExtension(for: mimeType, source: source))
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try restoreAsset(from: source, to: destination)
        if kind != "drawing" { restoredURIs[assetID] = destination.absoluteString }
    }

    private func retainedHistoryRecords(from records: [CKRecord]) -> [CKRecord] {
        let ordered = records.sorted {
            ($0["capturedAt"] as? Date ?? .distantPast) > ($1["capturedAt"] as? Date ?? .distantPast)
        }
        var recentDays = Set<String>()
        for day in ordered.compactMap({ $0["entryDay"] as? String }) where recentDays.count < 5 {
            recentDays.insert(day)
        }
        var retainedRecordIDs = Set<String>()
        var retainedDailyDays = Set<String>()
        var retainedWeeks = Set<String>()
        let calendar = Calendar(identifier: .iso8601)
        let twelveWeeksAgo = calendar.date(byAdding: .weekOfYear, value: -12, to: Date()) ?? .distantPast
        for record in ordered {
            let day = record["entryDay"] as? String ?? ""
            let date = record["capturedAt"] as? Date ?? .distantPast
            if recentDays.contains(day) {
                if retainedDailyDays.insert(day).inserted { retainedRecordIDs.insert(record.recordID.recordName) }
            } else if date >= twelveWeeksAgo {
                let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
                let week = "\(components.yearForWeekOfYear ?? 0)-\(components.weekOfYear ?? 0)"
                if retainedWeeks.insert(week).inserted { retainedRecordIDs.insert(record.recordID.recordName) }
            }
        }
        return ordered.filter {
            retainedRecordIDs.contains($0.recordID.recordName)
        }
    }

    private func deleteHistoryRecords(named recordNames: Set<String>) async {
        for name in recordNames {
            _ = try? await database.deleteRecord(
                withID: CKRecord.ID(recordName: name)
            )
        }
        try? await removeFromHistoryIndex(recordNames)
        try? await garbageCollectHistoryBlobs()
    }

    private func historyBlobRecordNames(_ record: CKRecord) -> Set<String> {
        if let names = record["blobRecordNames"] as? [String] {
            return Set(names)
        }
        guard let manifestAsset = record["manifest"] as? CKAsset,
              let manifestURL = manifestAsset.fileURL,
              let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return Set(manifest.compactMap { $0["blobRecordName"] as? String })
    }

    private func garbageCollectHistoryBlobs() async throws {
        guard let index = try? await database.record(for: historyIndexRecordID) else {
            return
        }
        let indexedBlobs = Set(index["blobRecordNames"] as? [String] ?? [])
        guard !indexedBlobs.isEmpty else { return }
        let historyNames = index["recordNames"] as? [String] ?? []
        let records = await historyRecords(named: historyNames)
        let retainedBlobs = records.reduce(into: Set<String>()) { result, record in
            result.formUnion(historyBlobRecordNames(record))
        }
        let discardedBlobs = indexedBlobs.subtracting(retainedBlobs)
        for name in discardedBlobs {
            _ = try? await database.deleteRecord(
                withID: CKRecord.ID(recordName: name)
            )
        }
        index["blobRecordNames"] = retainedBlobs.sorted() as CKRecordValue
        _ = try await database.save(index)
    }

    private func pruneHistory() async throws {
        let index = try await database.record(for: historyIndexRecordID)
        let records = await historyRecords(
            named: index["recordNames"] as? [String] ?? []
        )
        let retainedNames = Set(
            retainedHistoryRecords(from: records).map(\.recordID.recordName)
        )
        let discardedNames = Set(records.map(\.recordID.recordName))
            .subtracting(retainedNames)
        await deleteHistoryRecords(named: discardedNames)
    }

    private func safeFileName(_ value: String) -> String {
        String(value.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
    }

    private func fileExtension(for mimeType: String?, source: URL) -> String {
        if let mimeType,
           let fileExtension = UTType(mimeType: mimeType)?.preferredFilenameExtension,
           !fileExtension.isEmpty {
            return fileExtension
        }
        return source.pathExtension.isEmpty ? "bin" : source.pathExtension
    }

    private func restoreAsset(from source: URL, to destination: URL) throws {
        let staging = destination
            .deletingLastPathComponent()
            .appendingPathComponent(".\(destination.lastPathComponent)-\(UUID().uuidString).staging")
        defer { try? FileManager.default.removeItem(at: staging) }
        try FileManager.default.copyItem(at: source, to: staging)
        if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: staging)
        } else {
            try FileManager.default.moveItem(at: staging, to: destination)
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

@objc(AppLifecyclePlugin)
@MainActor
public final class AppLifecyclePlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "AppLifecyclePlugin"
    public let jsName = "AppLifecycle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "flushRequested", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise)
    ]

    @objc public func flushRequested(_ call: CAPPluginCall) {
        call.resolve(["requestedAt": Date().iso8601String])
    }

    @objc public func openUrl(_ call: CAPPluginCall) {
        guard let text = call.getString("url"),
              let url = URL(string: text),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            call.reject("A web address is required.", "NATIVE_FAILURE")
            return
        }
        Task { @MainActor in
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve(["opened": true])
                } else {
                    call.reject("This link could not be opened.", "NATIVE_FAILURE")
                }
            }
        }
    }
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
        catch { call.reject("The asset could not be moved to recoverable trash.", "NATIVE_FAILURE", error) }
    }

    @objc public func storageHealth(_ call: CAPPluginCall) {
        guard let health = store?.storageHealth() else { call.reject("Storage status is unavailable.", "UNAVAILABLE"); return }
        var result: [String: Any] = ["lowStorage": health.lowStorage]
        if let bytes = health.availableBytes { result["availableBytes"] = bytes }
        call.resolve(result)
    }
}

@objc(NativeSharePlugin)
@MainActor
public final class NativeSharePlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "NativeSharePlugin"
    public let jsName = "NativeShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]
    private let shareTitleBandHeight: CGFloat = 88
    private var shareFolder: URL?

    private struct ShareLink {
        let url: URL
        let title: String
        let x: CGFloat
        let y: CGFloat
        let width: CGFloat
        let height: CGFloat
    }

    @objc public func exportPage(_ call: CAPPluginCall) {
        let format = call.getString("format")
        let title = call.getString("title")
        let fileStem = call.getString("fileStem")
        let paperRect = rect(from: call.getObject("paperRect"))
        let transcripts = stringList(call, "transcripts")
        let links = shareLinks(from: call)
        let documentId = call.getString("documentId")
        let captureMode = call.getString("captureMode")
        let previewInsetTop = call.getDouble("previewInsetTop")
            ?? call.getInt("previewInsetTop").map(Double.init)
            ?? 0
        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                return
            }
            guard let format, format == "jpg" || format == "pdf",
                  let title,
                  let fileStem else {
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                return
            }
            let image: UIImage?
            if captureMode == "webview" {
                image = await self.captureWebView(rect: paperRect)
            } else {
                image = self.renderJournalPage(
                    paperRect: paperRect,
                    documentId: documentId,
                    previewInsetTop: previewInsetTop
                )
            }
            guard let image else {
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                return
            }
            do {
                let titled = self.titledImage(image, title: title)
                let folder = try self.prepareShareFolder()
                let safeStem = self.safeFileStem(fileStem)
                if format == "pdf" {
                    let url = folder.appendingPathComponent("\(safeStem).pdf")
                    try self.writePDF(
                        image: titled,
                        transcripts: transcripts,
                        links: links,
                        to: url
                    )
                    call.resolve(["fileUri": url.absoluteString, "fileName": url.lastPathComponent])
                } else {
                    let url = folder.appendingPathComponent("\(safeStem).jpg")
                    guard let data = titled.jpegData(compressionQuality: 0.86) else {
                        call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                        return
                    }
                    try data.write(to: url, options: .atomic)
                    call.resolve(["fileUri": url.absoluteString, "fileName": url.lastPathComponent])
                }
            } catch {
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE", error)
            }
        }
    }

    @objc public func share(_ call: CAPPluginCall) {
        call.keepAlive = true
        let title = call.getString("title")
        let fileURIs = stringList(call, "fileUris")
        let sourceRect = rect(from: call.getObject("sourceRect"))
        Task { @MainActor [weak self] in
            guard let self else {
                call.keepAlive = false
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                return
            }
            guard title != nil,
                  !fileURIs.isEmpty,
                  let host = self.topViewController() else {
                call.keepAlive = false
                call.reject("This page could not be shared. Try again.", "NATIVE_FAILURE")
                return
            }
            do {
                let items = try self.preparedShareItems(fileURIs: fileURIs)
                let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
                activity.excludedActivityTypes = [
                    .addToReadingList,
                    .assignToContact,
                    .markupAsPDF,
                    .postToFacebook,
                    .postToFlickr,
                    .postToTencentWeibo,
                    .postToTwitter,
                    .postToVimeo,
                    .postToWeibo,
                    .print
                ]
                activity.completionWithItemsHandler = { [weak self] activityType, completed, _, _ in
                    Task { @MainActor in
                        self?.clearShareFolder()
                        call.keepAlive = false
                        var payload: [String: Any] = ["completed": completed]
                        if let activityType {
                            payload["activityType"] = activityType.rawValue
                        }
                        call.resolve(payload)
                    }
                }
                if let popover = activity.popoverPresentationController {
                    let view = self.bridge?.webView ?? host.view
                    popover.sourceView = view
                    popover.sourceRect = sourceRect ?? CGRect(
                        x: view?.bounds.midX ?? 40,
                        y: 24,
                        width: 56,
                        height: 56
                    )
                    popover.permittedArrowDirections = [.up, .down]
                }
                host.present(activity, animated: true)
            } catch {
                call.keepAlive = false
                let code = (error as NSError).domain == NSCocoaErrorDomain ? "ASSET_MISSING" : "NATIVE_FAILURE"
                call.reject("This page could not be shared. Try again.", code, error)
            }
        }
    }

    private func renderJournalPage(
        paperRect: CGRect?,
        documentId: String?,
        previewInsetTop: Double
    ) -> UIImage? {
        let size: CGSize
        if let paperRect, paperRect.width > 8, paperRect.height > 8 {
            size = paperRect.size
        } else if let bounds = bridge?.webView?.bounds, bounds.width > 8, bounds.height > 8 {
            size = bounds.size
        } else {
            size = CGSize(width: 1024, height: 680)
        }
        let format = UIGraphicsImageRendererFormat()
        format.opaque = true
        format.scale = max(UIScreen.main.scale, 1)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            let bounds = CGRect(origin: .zero, size: size)
            UIColor(red: 246 / 255, green: 240 / 255, blue: 227 / 255, alpha: 1).setFill()
            UIBezierPath(roundedRect: bounds, cornerRadius: 20).fill()
            let inset = max(0, min(CGFloat(previewInsetTop), size.height - 8))
            let drawingRect = CGRect(
                x: 0,
                y: inset,
                width: size.width,
                height: max(size.height - inset, 1)
            )
            self.drawingImage(documentId: documentId, size: drawingRect.size)?
                .draw(in: drawingRect)
        }
    }

    private func captureWebView(rect: CGRect?) async -> UIImage? {
        guard let webView = bridge?.webView else { return nil }
        let configuration = WKSnapshotConfiguration()
        if let rect, rect.width > 8, rect.height > 8 {
            configuration.rect = rect
        }
        configuration.afterScreenUpdates = true
        return await withCheckedContinuation { continuation in
            webView.takeSnapshot(with: configuration) { image, _ in
                continuation.resume(returning: image)
            }
        }
    }

    private func drawingImage(documentId: String?, size: CGSize) -> UIImage? {
        guard let documentId, !documentId.isEmpty else { return nil }
        let store = ApplicationSupportPencilDrawingStore()
        if let preview = try? store.loadPreview(documentID: documentId),
           let image = UIImage(contentsOfFile: preview.fileURL.path) {
            return image
        }
        guard let data = try? store.load(documentID: documentId),
              let drawing = try? PKDrawing(data: data),
              !drawing.strokes.isEmpty else {
            return nil
        }
        return PencilInkColor.renderPreview(
            drawing: drawing,
            bounds: CGRect(origin: .zero, size: size)
        )
    }

    private func topViewController() -> UIViewController? {
        var host = bridge?.viewController
        while let presented = host?.presentedViewController {
            host = presented
        }
        return host
    }

    private func stringList(_ call: CAPPluginCall, _ key: String) -> [String] {
        if let typed = call.getArray(key, String.self), !typed.isEmpty {
            return typed
        }
        return stringArray(call.getArray(key)) ?? []
    }

    private func stringArray(_ value: JSArray?) -> [String]? {
        value?.compactMap { item in
            if let text = item as? String { return text }
            return nil
        }
    }

    private func rect(from value: JSObject?) -> CGRect? {
        guard let value,
              let x = doubleValue(value["x"]),
              let y = doubleValue(value["y"]),
              let width = doubleValue(value["width"]),
              let height = doubleValue(value["height"]),
              width > 1,
              height > 1 else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private func doubleValue(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        if let number = value as? Double { return number }
        if let number = value as? Float { return Double(number) }
        if let number = value as? Int { return Double(number) }
        if let text = value as? String { return Double(text) }
        return nil
    }

    private func safeFileStem(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        let mapped = String(value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" })
        let cleaned = mapped
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        return cleaned.isEmpty ? "Journal-page" : String(cleaned.prefix(80))
    }

    private func fileURL(from uri: String) -> URL? {
        if let url = URL(string: uri), url.isFileURL {
            return url
        }
        guard uri.hasPrefix("file:") else { return nil }
        var path = uri
        if path.hasPrefix("file://") {
            path = String(path.dropFirst("file://".count))
        } else {
            path = String(path.dropFirst("file:".count))
        }
        if let decoded = path.removingPercentEncoding {
            path = decoded
        }
        return URL(fileURLWithPath: path)
    }

    private func titledImage(_ snapshot: UIImage, title: String) -> UIImage {
        let bandHeight = shareTitleBandHeight
        let size = CGSize(width: max(snapshot.size.width, 1), height: snapshot.size.height + bandHeight)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = snapshot.scale
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            UIColor(red: 0.973, green: 0.941, blue: 0.886, alpha: 1).setFill()
            UIRectFill(CGRect(origin: .zero, size: size))
            let titleRect = CGRect(x: 24, y: 22, width: size.width - 48, height: bandHeight - 28)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28, weight: .semibold),
                .foregroundColor: UIColor(red: 0.129, green: 0.106, blue: 0.078, alpha: 1)
            ]
            (title as NSString).draw(
                with: titleRect,
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: attributes,
                context: nil
            )
            snapshot.draw(in: CGRect(x: 0, y: bandHeight, width: snapshot.size.width, height: snapshot.size.height))
        }
    }

    private func writePDF(
        image: UIImage,
        transcripts: [String],
        links: [ShareLink],
        to url: URL
    ) throws {
        let pageSize = CGSize(width: max(image.size.width, 1), height: max(image.size.height, 1))
        let bounds = CGRect(origin: .zero, size: pageSize)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)
        try renderer.writePDF(to: url) { context in
            context.beginPage()
            image.draw(in: bounds)
            self.drawShareLinkCards(
                links,
                paperSize: CGSize(
                    width: pageSize.width,
                    height: max(pageSize.height - self.shareTitleBandHeight, 1)
                ),
                originY: self.shareTitleBandHeight,
                in: context
            )
            if !transcripts.isEmpty {
                self.writeTranscriptPages(transcripts, pageSize: pageSize, in: context)
            }
            if !links.isEmpty {
                self.writeLinkIndexPages(links, pageSize: pageSize, in: context)
            }
        }
    }

    private func shareLinks(from call: CAPPluginCall) -> [ShareLink] {
        call.getArray("links", JSObject.self)?.compactMap { object in
            guard let text = object["url"] as? String,
                  let url = URL(string: text),
                  let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https",
                  let x = self.unitValue(object["x"]),
                  let y = self.unitValue(object["y"]),
                  let width = self.unitValue(object["width"]),
                  let height = self.unitValue(object["height"]),
                  width > 0,
                  height > 0 else {
                return nil
            }
            let rawTitle = (object["title"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return ShareLink(
                url: url,
                title: rawTitle.isEmpty ? (url.host ?? url.absoluteString) : rawTitle,
                x: x,
                y: y,
                width: width,
                height: height
            )
        } ?? []
    }

    private func unitValue(_ value: Any?) -> CGFloat? {
        guard let number = doubleValue(value), number >= 0, number <= 1 else {
            return nil
        }
        return CGFloat(number)
    }

    private func drawShareLinkCards(
        _ links: [ShareLink],
        paperSize: CGSize,
        originY: CGFloat,
        in context: UIGraphicsPDFRendererContext
    ) {
        let ink = UIColor(red: 0.129, green: 0.106, blue: 0.078, alpha: 1)
        let muted = UIColor(red: 0.384, green: 0.345, blue: 0.294, alpha: 1)
        let fill = UIColor(red: 1, green: 0.992, blue: 0.969, alpha: 0.92)
        let stroke = UIColor(red: 83 / 255, green: 68 / 255, blue: 45 / 255, alpha: 0.2)
        for link in links {
            let rect = CGRect(
                x: link.x * paperSize.width,
                y: originY + link.y * paperSize.height,
                width: max(link.width * paperSize.width, 56),
                height: max(link.height * paperSize.height, 56)
            ).integral
            let card = UIBezierPath(roundedRect: rect, cornerRadius: 14)
            fill.setFill()
            stroke.setStroke()
            card.lineWidth = 1
            card.fill()
            card.stroke()

            let iconRect = CGRect(x: rect.minX + 16, y: rect.midY - 13.5, width: 27, height: 27)
            if let icon = UIImage(systemName: "link")?.withTintColor(ink, renderingMode: .alwaysOriginal) {
                icon.draw(in: iconRect)
            }
            let textRect = CGRect(
                x: iconRect.maxX + 12,
                y: rect.minY + 12,
                width: max(rect.maxX - iconRect.maxX - 28, 40),
                height: max(rect.height - 24, 20)
            )
            let title = link.title as NSString
            title.draw(
                with: CGRect(x: textRect.minX, y: textRect.minY, width: textRect.width, height: 24),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [
                    .font: UIFont.systemFont(ofSize: 20, weight: .semibold),
                    .foregroundColor: ink
                ],
                context: nil
            )
            ((link.url.host ?? link.url.absoluteString) as NSString).draw(
                with: CGRect(x: textRect.minX, y: textRect.minY + 26, width: textRect.width, height: 22),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [
                    .font: UIFont.systemFont(ofSize: 16, weight: .regular),
                    .foregroundColor: muted
                ],
                context: nil
            )
            context.setURL(link.url, for: rect)
        }
    }

    private func writeTranscriptPages(
        _ transcripts: [String],
        pageSize: CGSize,
        in context: UIGraphicsPDFRendererContext
    ) {
        context.beginPage()
        let heading = "What was said" as NSString
        let headingRect = CGRect(x: 36, y: 36, width: pageSize.width - 72, height: 48)
        heading.draw(
            with: headingRect,
            options: [.usesLineFragmentOrigin],
            attributes: [
                .font: UIFont.systemFont(ofSize: 32, weight: .bold),
                .foregroundColor: UIColor(red: 0.129, green: 0.106, blue: 0.078, alpha: 1)
            ],
            context: nil
        )
        var cursorY: CGFloat = 100
        for (index, transcript) in transcripts.enumerated() {
            let label = "Recording \(index + 1)" as NSString
            let labelRect = CGRect(x: 36, y: cursorY, width: pageSize.width - 72, height: 28)
            label.draw(
                with: labelRect,
                options: [.usesLineFragmentOrigin],
                attributes: [
                    .font: UIFont.systemFont(ofSize: 20, weight: .semibold),
                    .foregroundColor: UIColor(red: 0.286, green: 0.255, blue: 0.212, alpha: 1)
                ],
                context: nil
            )
            cursorY += 34
            let body = transcript as NSString
            let bodyRect = CGRect(x: 36, y: cursorY, width: pageSize.width - 72, height: pageSize.height - cursorY - 36)
            let bodyAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 22, weight: .regular),
                .foregroundColor: UIColor(red: 0.129, green: 0.106, blue: 0.078, alpha: 1)
            ]
            body.draw(with: bodyRect, options: [.usesLineFragmentOrigin], attributes: bodyAttributes, context: nil)
            let drawn = body.boundingRect(
                with: bodyRect.size,
                options: [.usesLineFragmentOrigin],
                attributes: bodyAttributes,
                context: nil
            )
            cursorY += ceil(drawn.height) + 28
        }
    }

    private func writeLinkIndexPages(
        _ links: [ShareLink],
        pageSize: CGSize,
        in context: UIGraphicsPDFRendererContext
    ) {
        let ink = UIColor(red: 0.129, green: 0.106, blue: 0.078, alpha: 1)
        let muted = UIColor(red: 0.384, green: 0.345, blue: 0.294, alpha: 1)
        context.beginPage()
        ("Web links" as NSString).draw(
            with: CGRect(x: 36, y: 36, width: pageSize.width - 72, height: 48),
            options: [.usesLineFragmentOrigin],
            attributes: [
                .font: UIFont.systemFont(ofSize: 32, weight: .bold),
                .foregroundColor: ink
            ],
            context: nil
        )
        var cursorY: CGFloat = 100
        let rowHeight: CGFloat = 88
        for link in links {
            if cursorY + rowHeight > pageSize.height - 36 {
                context.beginPage()
                cursorY = 36
            }
            let row = CGRect(x: 36, y: cursorY, width: pageSize.width - 72, height: rowHeight)
            let card = UIBezierPath(roundedRect: row, cornerRadius: 14)
            UIColor(red: 1, green: 0.992, blue: 0.969, alpha: 1).setFill()
            UIColor(red: 83 / 255, green: 68 / 255, blue: 45 / 255, alpha: 0.2).setStroke()
            card.lineWidth = 1
            card.fill()
            card.stroke()
            (link.title as NSString).draw(
                with: CGRect(x: row.minX + 20, y: row.minY + 16, width: row.width - 40, height: 28),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [
                    .font: UIFont.systemFont(ofSize: 24, weight: .semibold),
                    .foregroundColor: ink
                ],
                context: nil
            )
            (link.url.absoluteString as NSString).draw(
                with: CGRect(x: row.minX + 20, y: row.minY + 48, width: row.width - 40, height: 24),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [
                    .font: UIFont.systemFont(ofSize: 18, weight: .regular),
                    .foregroundColor: muted
                ],
                context: nil
            )
            context.setURL(link.url, for: row)
            cursorY += rowHeight + 16
        }
    }

    private func prepareShareFolder() throws -> URL {
        clearShareFolder()
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("journal-share-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        shareFolder = folder
        return folder
    }

    private func preparedShareItems(fileURIs: [String]) throws -> [URL] {
        let previous = shareFolder
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("journal-share-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var items: [URL] = []
        do {
            for (index, uri) in fileURIs.enumerated() {
                guard let source = fileURL(from: uri),
                      FileManager.default.fileExists(atPath: source.path) else {
                    continue
                }
                let destination = folder.appendingPathComponent(source.lastPathComponent.isEmpty
                    ? "item-\(index + 1)"
                    : source.lastPathComponent)
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.copyItem(at: source, to: destination)
                items.append(destination)
            }
            guard !items.isEmpty else {
                throw CocoaError(.fileNoSuchFile)
            }
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        if let previous {
            try? FileManager.default.removeItem(at: previous)
        }
        shareFolder = folder
        return items
    }

    private func clearShareFolder() {
        if let shareFolder {
            try? FileManager.default.removeItem(at: shareFolder)
        }
        shareFolder = nil
    }
}
