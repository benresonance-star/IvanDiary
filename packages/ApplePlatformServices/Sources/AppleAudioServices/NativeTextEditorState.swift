import Foundation

public enum NativeTextEditorMode: String, Sendable {
    case add
    case edit
}

public enum NativeTextInputMethod: String, Sendable {
    case voice
    case keyboard
}

public enum NativeKeyboardSessionAction: Equatable, Sendable {
    case resignFirstResponder
    case useHiddenInputView
    case useSystemInputView
    case reloadInputViews
    case becomeFirstResponder
    case restoreSelection
}

public enum NativeKeyboardSessionCoordinator {
    public static func transition(
        to inputMethod: NativeTextInputMethod
    ) -> [NativeKeyboardSessionAction] {
        [
            .resignFirstResponder,
            inputMethod == .keyboard
                ? .useSystemInputView
                : .useHiddenInputView,
            .reloadInputViews,
            .becomeFirstResponder,
            .restoreSelection,
        ]
    }
}

public enum NativeTextEditorPhase: Equatable, Sendable {
    case ready
    case recording
    case transcribing
    case error(String)
}

public struct NativeTextEditorState: Equatable, Sendable {
    public var text: String
    public var selection: NSRange
    public var inputMethod: NativeTextInputMethod
    public var phase: NativeTextEditorPhase

    public init(
        text: String,
        selection: NSRange? = nil,
        inputMethod: NativeTextInputMethod = .voice,
        phase: NativeTextEditorPhase = .ready
    ) {
        self.text = text
        self.selection = selection ?? NSRange(location: (text as NSString).length, length: 0)
        self.inputMethod = inputMethod
        self.phase = phase
        clampSelection()
    }

    public var canCancel: Bool {
        phase != .recording && phase != .transcribing
    }

    public var hasPreviewContent: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public var canSubmit: Bool {
        canCancel && hasPreviewContent
    }

    public func shouldShowSubmitAction(for mode: NativeTextEditorMode) -> Bool {
        mode == .edit || hasPreviewContent
    }

    public mutating func selectInputMethod(_ inputMethod: NativeTextInputMethod) {
        self.inputMethod = inputMethod
    }

    public mutating func update(text: String, selection: NSRange) {
        self.text = text
        self.selection = selection
        clampSelection()
    }

    public mutating func beginRecording() {
        phase = .recording
    }

    public mutating func beginTranscribing() {
        phase = .transcribing
    }

    public mutating func finishTranscribing(_ spokenText: String) {
        insertSpokenText(spokenText)
        phase = .ready
    }

    public mutating func fail(_ message: String) {
        phase = .error(message)
    }

    public mutating func resetStatus() {
        phase = .ready
    }

    private mutating func insertSpokenText(_ spokenText: String) {
        let spoken = spokenText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !spoken.isEmpty else { return }

        clampSelection()
        let source = text as NSString
        let before = source.substring(to: selection.location)
        let after = source.substring(from: NSMaxRange(selection))
        let prefix = before.isEmpty || before.last?.isWhitespace == true ? "" : " "
        let suffix = after.isEmpty || after.first?.isWhitespace == true ? "" : " "
        let insertion = "\(prefix)\(spoken)\(suffix)"
        text = source.replacingCharacters(in: selection, with: insertion)
        selection = NSRange(
            location: selection.location + (insertion as NSString).length,
            length: 0
        )
    }

    private mutating func clampSelection() {
        let length = (text as NSString).length
        let location = min(max(0, selection.location), length)
        let availableLength = length - location
        selection = NSRange(
            location: location,
            length: min(max(0, selection.length), availableLength)
        )
    }
}

public enum NativeSpeechProviderKind: Equatable, Sendable {
    case speechRecognizer
    case speechAnalyzer
}

public struct NativeSpeechCapabilities: Equatable, Sendable {
    public let operatingSystemMajorVersion: Int
    public let modernAPIAvailable: Bool
    public let modernDeviceSupported: Bool
    public let localeSupported: Bool
    public let assetsInstalled: Bool
    public let preservesContextualStrings: Bool

    public init(
        operatingSystemMajorVersion: Int,
        modernAPIAvailable: Bool,
        modernDeviceSupported: Bool,
        localeSupported: Bool,
        assetsInstalled: Bool,
        preservesContextualStrings: Bool
    ) {
        self.operatingSystemMajorVersion = operatingSystemMajorVersion
        self.modernAPIAvailable = modernAPIAvailable
        self.modernDeviceSupported = modernDeviceSupported
        self.localeSupported = localeSupported
        self.assetsInstalled = assetsInstalled
        self.preservesContextualStrings = preservesContextualStrings
    }
}

public enum NativeSpeechProviderPolicy {
    public static func preferredProvider(
        for capabilities: NativeSpeechCapabilities
    ) -> NativeSpeechProviderKind {
        guard capabilities.operatingSystemMajorVersion >= 26,
              capabilities.modernAPIAvailable,
              capabilities.modernDeviceSupported,
              capabilities.localeSupported,
              capabilities.assetsInstalled,
              capabilities.preservesContextualStrings else {
            return .speechRecognizer
        }
        return .speechAnalyzer
    }
}
