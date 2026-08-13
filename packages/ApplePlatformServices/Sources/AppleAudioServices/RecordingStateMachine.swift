import Foundation

public enum JournalRecordingState: String, Codable, Sendable {
    case idle, recording, finalising, saved, interrupted, error
}

public struct JournalRecordingSnapshot: Codable, Equatable, Sendable {
    public var id: String
    public var state: JournalRecordingState
    public var elapsedMilliseconds: Int
    public var temporaryURL: URL?
    public var message: String?

    public init(
        id: String = "",
        state: JournalRecordingState = .idle,
        elapsedMilliseconds: Int = 0,
        temporaryURL: URL? = nil,
        message: String? = nil
    ) {
        self.id = id
        self.state = state
        self.elapsedMilliseconds = elapsedMilliseconds
        self.temporaryURL = temporaryURL
        self.message = message
    }
}

public enum RecordingTransitionError: Error { case invalidTransition }

public struct RecordingStateMachine: Sendable {
    public private(set) var snapshot = JournalRecordingSnapshot()

    public init() {}

    public mutating func start(id: String, temporaryURL: URL) throws {
        guard snapshot.state == .idle || snapshot.state == .saved || snapshot.state == .error else {
            throw RecordingTransitionError.invalidTransition
        }
        snapshot = JournalRecordingSnapshot(id: id, state: .recording, temporaryURL: temporaryURL)
    }

    public mutating func recover(_ recovered: JournalRecordingSnapshot) {
        snapshot = recovered
        snapshot.state = .interrupted
    }

    public mutating func interrupt(elapsedMilliseconds: Int) throws {
        guard snapshot.state == .recording else { throw RecordingTransitionError.invalidTransition }
        snapshot.state = .interrupted
        snapshot.elapsedMilliseconds = elapsedMilliseconds
        snapshot.message = "Recording was interrupted. The captured audio can be recovered."
    }

    public mutating func resume() throws {
        guard snapshot.state == .interrupted else { throw RecordingTransitionError.invalidTransition }
        snapshot.state = .recording
        snapshot.message = nil
    }

    public mutating func finalise(elapsedMilliseconds: Int) throws {
        guard snapshot.state == .recording || snapshot.state == .interrupted else {
            throw RecordingTransitionError.invalidTransition
        }
        snapshot.state = .finalising
        snapshot.elapsedMilliseconds = elapsedMilliseconds
        snapshot.message = nil
    }

    public mutating func saved() throws {
        guard snapshot.state == .finalising else { throw RecordingTransitionError.invalidTransition }
        snapshot.state = .saved
        snapshot.temporaryURL = nil
    }

    public mutating func fail(_ message: String) {
        snapshot.state = .error
        snapshot.message = message
    }
}
