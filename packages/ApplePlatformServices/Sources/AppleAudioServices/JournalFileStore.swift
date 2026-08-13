import CryptoKit
import Foundation

public struct FinalizedAsset: Equatable, Sendable {
    public let id: String
    public let url: URL
    public let mimeType: String
    public let byteLength: Int64
    public let checksum: String
}

public struct StorageHealth: Equatable, Sendable {
    public let availableBytes: Int64?
    public let lowStorage: Bool
}

public final class JournalFileStore: @unchecked Sendable {
    private let fileManager: FileManager
    private let root: URL

    public init(fileManager: FileManager = .default, applicationSupportRoot: URL? = nil) throws {
        self.fileManager = fileManager
        if let applicationSupportRoot {
            root = applicationSupportRoot
        } else {
            root = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ).appendingPathComponent("JournalAssets", isDirectory: true)
        }
        try fileManager.createDirectory(at: assetsDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: trashDirectory, withIntermediateDirectories: true)
    }

    private var assetsDirectory: URL { root.appendingPathComponent("OriginalAudio", isDirectory: true) }
    private var trashDirectory: URL { root.appendingPathComponent("Trash", isDirectory: true) }

    public func finalize(temporaryURL: URL, assetID: String, mimeType: String) throws -> FinalizedAsset {
        guard fileManager.fileExists(atPath: temporaryURL.path) else { throw CocoaError(.fileNoSuchFile) }
        let destination = assetsDirectory.appendingPathComponent(assetID).appendingPathExtension("m4a")
        if fileManager.fileExists(atPath: destination.path) {
            return try asset(at: destination, id: assetID, mimeType: mimeType)
        }
        let staging = assetsDirectory.appendingPathComponent(".\(assetID).staging")
        if fileManager.fileExists(atPath: staging.path) { try fileManager.removeItem(at: staging) }
        try fileManager.copyItem(at: temporaryURL, to: staging)
        let handle = try FileHandle(forWritingTo: staging)
        try handle.synchronize()
        try handle.close()
        try fileManager.moveItem(at: staging, to: destination)
        try fileManager.removeItem(at: temporaryURL)
        return try asset(at: destination, id: assetID, mimeType: mimeType)
    }

    public func moveToTrash(assetID: String) throws {
        let source = assetsDirectory.appendingPathComponent(assetID).appendingPathExtension("m4a")
        guard fileManager.fileExists(atPath: source.path) else { return }
        let destination = trashDirectory.appendingPathComponent("\(assetID)-\(UUID().uuidString).m4a")
        try fileManager.moveItem(at: source, to: destination)
    }

    public func storageHealth(lowStorageThreshold: Int64 = 100 * 1_024 * 1_024) -> StorageHealth {
        let values = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        let available = values?.volumeAvailableCapacityForImportantUsage
        return StorageHealth(availableBytes: available, lowStorage: available.map { $0 < lowStorageThreshold } ?? false)
    }

    private func asset(at url: URL, id: String, mimeType: String) throws -> FinalizedAsset {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        let checksum = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return FinalizedAsset(id: id, url: url, mimeType: mimeType, byteLength: Int64(data.count), checksum: checksum)
    }
}
