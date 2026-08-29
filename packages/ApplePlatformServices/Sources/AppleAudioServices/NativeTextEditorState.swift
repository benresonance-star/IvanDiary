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
    case setEditable(Bool)
    case becomeFirstResponder
    case restoreSelection
}

public enum NativeKeyboardSessionCoordinator {
    public static func transition(
        to inputMethod: NativeTextInputMethod
    ) -> [NativeKeyboardSessionAction] {
        var actions: [NativeKeyboardSessionAction] = [
            .resignFirstResponder,
            inputMethod == .keyboard
                ? .useSystemInputView
                : .useHiddenInputView,
            .reloadInputViews,
            .setEditable(inputMethod == .keyboard),
        ]
        if inputMethod == .keyboard {
            actions.append(.becomeFirstResponder)
        }
        actions.append(.restoreSelection)
        return actions
    }
}

public enum NativeTextEditorLayout {
    public static func editorWidth(safeAreaWidth: CGFloat) -> CGFloat {
        min(920, max(0, safeAreaWidth - 36))
    }
}

public enum NativeTextEditorPhase: Equatable, Sendable {
    case ready
    case recording
    case transcribing
    case error(String)
}

public struct NativeTextEditorState: Equatable, Sendable {
    private struct LiveAnchor: Equatable, Sendable {
        let text: String
        let selection: NSRange
    }

    public var text: String
    public var selection: NSRange
    public var inputMethod: NativeTextInputMethod
    public var phase: NativeTextEditorPhase
    private var liveAnchor: LiveAnchor?
    private var liveFinalizedText = ""
    private var liveProvisionalText = ""

    public init(
        text: String,
        selection: NSRange? = nil,
        inputMethod: NativeTextInputMethod = .keyboard,
        phase: NativeTextEditorPhase = .ready
    ) {
        self.text = text
        self.selection = selection ?? NSRange(location: (text as NSString).length, length: 0)
        self.inputMethod = inputMethod
        self.phase = phase
        liveAnchor = nil
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
        switch mode {
        case .add:
            hasPreviewContent && canCancel
        case .edit:
            true
        }
    }

    public mutating func selectInputMethod(_ inputMethod: NativeTextInputMethod) {
        self.inputMethod = inputMethod
    }

    public mutating func update(text: String, selection: NSRange) {
        self.text = text
        self.selection = selection
        clampSelection()
    }

    public mutating func updateSelection(_ selection: NSRange) {
        self.selection = selection
        clampSelection()
    }

    public mutating func beginRecording() {
        phase = .recording
    }

    public mutating func beginLiveTranscription() {
        liveAnchor = LiveAnchor(text: text, selection: selection)
        liveFinalizedText = ""
        liveProvisionalText = ""
        phase = .recording
    }

    public mutating func updateLivePreview(_ spokenText: String) {
        guard liveAnchor != nil, phase == .recording else { return }
        liveProvisionalText = spokenText
        renderLiveTranscript()
    }

    public mutating func updateLiveFinalized(_ spokenText: String) {
        guard liveAnchor != nil,
              phase == .recording || phase == .transcribing else { return }
        liveFinalizedText = spokenText
        liveProvisionalText = ""
        renderLiveTranscript()
    }

    public mutating func finishLiveTranscription(_ spokenText: String) {
        guard let liveAnchor else {
            finishTranscribing(spokenText)
            return
        }
        text = liveAnchor.text
        selection = liveAnchor.selection
        insertSpokenText(spokenText)
        self.liveAnchor = nil
        liveFinalizedText = ""
        liveProvisionalText = ""
        phase = .ready
    }

    public mutating func cancelLiveTranscription() {
        if let liveAnchor {
            text = liveAnchor.text
            selection = liveAnchor.selection
        }
        liveAnchor = nil
        liveFinalizedText = ""
        liveProvisionalText = ""
        phase = .ready
    }

    public mutating func failLiveTranscription(_ message: String) {
        cancelLiveTranscription()
        phase = .error(message)
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

    private mutating func renderLiveTranscript() {
        guard let liveAnchor else { return }
        text = liveAnchor.text
        selection = liveAnchor.selection
        let transcript = [liveFinalizedText, liveProvisionalText]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        insertSpokenText(transcript)
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
