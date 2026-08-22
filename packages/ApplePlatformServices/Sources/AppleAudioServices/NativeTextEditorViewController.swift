#if canImport(UIKit) && os(iOS)
import UIKit

public struct NativeTextEditorResult: Sendable {
    public let cancelled: Bool
    public let text: String

    public init(cancelled: Bool, text: String) {
        self.cancelled = cancelled
        self.text = text
    }
}

@MainActor
private final class NativeMicrophoneMeterView: UIView {
    private let bars = (0..<7).map { _ in UIView() }
    private var timer: Timer?
    private var phase: CGFloat = 0
    private var levelProvider: (() -> Float)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = true
        accessibilityLabel = "Microphone level"
        accessibilityValue = "Not recording"
        isHidden = true

        let stack = UIStackView(arrangedSubviews: bars)
        stack.axis = .horizontal
        stack.alignment = .center
        stack.distribution = .equalSpacing
        stack.spacing = 7
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        for bar in bars {
            bar.backgroundColor = UIColor(
                red: 68 / 255,
                green: 68 / 255,
                blue: 68 / 255,
                alpha: 1
            )
            bar.layer.cornerRadius = 3
            NSLayoutConstraint.activate([
                bar.widthAnchor.constraint(equalToConstant: 7),
                bar.heightAnchor.constraint(equalToConstant: 30),
            ])
        }
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func start(
        accessibilityValue: String,
        levelProvider: @escaping () -> Float
    ) {
        self.levelProvider = levelProvider
        self.accessibilityValue = accessibilityValue
        isHidden = false
        guard timer == nil else { return }
        let timer = Timer(
            timeInterval: 0.06,
            target: self,
            selector: #selector(updateBars),
            userInfo: nil,
            repeats: true
        )
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        updateBars()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        levelProvider = nil
        accessibilityValue = "Not recording"
        isHidden = true
    }

    @objc private func updateBars() {
        let measuredLevel = CGFloat(min(1, max(0, levelProvider?() ?? 0)))
        let level = max(0.2, measuredLevel)
        if !UIAccessibility.isReduceMotionEnabled {
            phase += 0.72
        }
        for (index, bar) in bars.enumerated() {
            let wave = (sin(phase + CGFloat(index) * 0.8) + 1) / 2
            let scale = max(0.12, min(1, 0.12 + level * (0.7 + wave * 0.9)))
            bar.transform = CGAffineTransform(scaleX: 1, y: scale)
        }
    }
}

@MainActor
public final class NativeTextEditorViewController: UIViewController, UITextViewDelegate {
    public var onComplete: ((NativeTextEditorResult) -> Void)?

    private var state: NativeTextEditorState
    private let mode: NativeTextEditorMode
    private let contextualStrings: [String]
    private let recordingLimitMilliseconds: Int?
    private let localeIdentifier: String
    private let voiceCoordinator: NativeTextVoiceCoordinator?
    private var recordingLimitTask: Task<Void, Never>?
    private var recordingStartTask: Task<Void, Never>?
    private var transcriptionTask: Task<Void, Never>?
    private var provisionalRenderTask: Task<Void, Never>?
    private var cardWidthConstraint: NSLayoutConstraint?
    private var methodControlWidthConstraint: NSLayoutConstraint?
    private var voiceButtonWidthConstraint: NSLayoutConstraint?
    private var completed = false
    private var lastAnnouncedStatus: String?

    private let methodControl = UIView()
    private let voiceMethodButton = UIButton(type: .system)
    private let keyboardMethodButton = UIButton(type: .system)
    private let textView = UITextView()
    private let voiceButton = UIButton(type: .system)
    private let statusLabel = UILabel()
    private let microphoneMeter = NativeMicrophoneMeterView()
    private let keyboardSpacer = UIView()
    private let cardView = UIView()
    private let titleLabel = UILabel()
    private let cancelButton = UIButton(type: .system)
    private let doneButton = UIButton(type: .system)
    private let actionsStack = UIStackView()

    private static let warmPaper = UIColor(
        red: 1,
        green: 250 / 255,
        blue: 240 / 255,
        alpha: 1
    )
    private static let warmBorder = UIColor(
        red: 143 / 255,
        green: 119 / 255,
        blue: 88 / 255,
        alpha: 1
    )
    private static let ink = UIColor(
        red: 44 / 255,
        green: 33 / 255,
        blue: 21 / 255,
        alpha: 1
    )
    private static let readyGreenBackground = UIColor(
        red: 223 / 255,
        green: 243 / 255,
        blue: 228 / 255,
        alpha: 1
    )
    private static let readyGreenBorder = UIColor(
        red: 49 / 255,
        green: 116 / 255,
        blue: 70 / 255,
        alpha: 1
    )
    private static let readyGreenText = UIColor(
        red: 23 / 255,
        green: 77 / 255,
        blue: 41 / 255,
        alpha: 1
    )

    public init(
        text: String,
        mode: NativeTextEditorMode,
        contextualStrings: [String],
        recordingLimitMilliseconds: Int?,
        localeIdentifier: String = "en-AU",
        voiceCoordinator: NativeTextVoiceCoordinator? = NativeTextVoiceCoordinator()
    ) {
        state = NativeTextEditorState(text: text)
        self.mode = mode
        self.contextualStrings = Array(contextualStrings.prefix(100))
        self.recordingLimitMilliseconds = recordingLimitMilliseconds
        self.localeIdentifier = localeIdentifier
        self.voiceCoordinator = voiceCoordinator
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        renderState()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if state.inputMethod == .keyboard {
            textView.becomeFirstResponder()
        }
        UIAccessibility.post(
            notification: .screenChanged,
            argument: state.inputMethod == .keyboard ? textView : methodControl
        )
    }

    public override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if !completed {
            recordingLimitTask?.cancel()
            recordingStartTask?.cancel()
            transcriptionTask?.cancel()
            microphoneMeter.stop()
            voiceCoordinator?.cancel()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    public override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        let safeAreaWidth = view.safeAreaLayoutGuide.layoutFrame.width
        if safeAreaWidth > 0 {
            cardWidthConstraint?.constant =
                NativeTextEditorLayout.editorWidth(
                    safeAreaWidth: safeAreaWidth
                )
        }
        let usesVerticalActions =
            (cardWidthConstraint?.constant ?? 920) < 820 ||
            traitCollection.preferredContentSizeCategory.isAccessibilityCategory
        actionsStack.axis = usesVerticalActions ? .vertical : .horizontal
        methodControlWidthConstraint?.isActive = !usesVerticalActions
        voiceButtonWidthConstraint?.isActive = !usesVerticalActions
    }

    private func configureActionButton(
        _ button: UIButton,
        title: String,
        background: UIColor
    ) {
        var configuration = UIButton.Configuration.filled()
        configuration.title = title
        configuration.baseForegroundColor = Self.ink
        configuration.baseBackgroundColor = background
        configuration.background.strokeColor = UIColor(
            red: 118 / 255,
            green: 95 / 255,
            blue: 66 / 255,
            alpha: 1
        )
        configuration.background.strokeWidth = 1
        configuration.cornerStyle = .medium
        configuration.titleLineBreakMode = .byWordWrapping
        let actionFont = UIFontMetrics(forTextStyle: .body).scaledFont(
            for: UIFont.systemFont(ofSize: 17, weight: .bold)
        )
        configuration.titleTextAttributesTransformer =
            UIConfigurationTextAttributesTransformer { attributes in
                var attributes = attributes
                attributes.font = actionFont
                return attributes
            }
        configuration.contentInsets = NSDirectionalEdgeInsets(
            top: 10,
            leading: 18,
            bottom: 10,
            trailing: 18
        )
        button.configuration = configuration
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.titleLabel?.numberOfLines = 0
    }

    private func configureMethodButton(
        _ button: UIButton,
        title: String,
        systemImage: String,
        action: Selector
    ) {
        var configuration = UIButton.Configuration.plain()
        configuration.title = title
        configuration.image = UIImage(
            systemName: systemImage,
            withConfiguration: UIImage.SymbolConfiguration(
                pointSize: 22,
                weight: .semibold
            )
        )
        configuration.imagePlacement = .leading
        configuration.imagePadding = 7
        configuration.baseForegroundColor = UIColor(
            red: 85 / 255,
            green: 62 / 255,
            blue: 39 / 255,
            alpha: 1
        )
        configuration.contentInsets = NSDirectionalEdgeInsets(
            top: 7,
            leading: 16,
            bottom: 7,
            trailing: 16
        )
        let methodFont = UIFontMetrics(forTextStyle: .body).scaledFont(
            for: UIFont.systemFont(ofSize: 17, weight: .heavy)
        )
        configuration.titleTextAttributesTransformer =
            UIConfigurationTextAttributesTransformer { attributes in
                var attributes = attributes
                attributes.font = methodFont
                return attributes
            }
        button.configuration = configuration
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.layer.cornerRadius = 10
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func configureView() {
        view.backgroundColor = UIColor(
            red: 34 / 255,
            green: 26 / 255,
            blue: 17 / 255,
            alpha: 0.48
        )
        cardView.backgroundColor = Self.warmPaper
        cardView.layer.borderColor = Self.warmBorder.cgColor
        cardView.layer.borderWidth = 1
        cardView.layer.cornerRadius = 22
        cardView.layer.shadowColor = UIColor.black.cgColor
        cardView.layer.shadowOpacity = 0.28
        cardView.layer.shadowRadius = 28
        cardView.layer.shadowOffset = CGSize(width: 0, height: 14)
        cardView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cardView)

        titleLabel.text = mode == .add ? "Add text" : "Edit text"
        titleLabel.isHidden = mode == .add
        titleLabel.font = .preferredFont(forTextStyle: .title1)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textColor = Self.ink

        configureActionButton(
            cancelButton,
            title: "Cancel",
            background: UIColor(red: 1, green: 253 / 255, blue: 248 / 255, alpha: 1)
        )
        cancelButton.addTarget(
            self,
            action: #selector(cancelTapped),
            for: .touchUpInside
        )
        configureActionButton(
            doneButton,
            title: mode == .add ? "Add to canvas" : "Save",
            background: UIColor(
                red: 234 / 255,
                green: 220 / 255,
                blue: 195 / 255,
                alpha: 1
            )
        )
        doneButton.addTarget(
            self,
            action: #selector(doneTapped),
            for: .touchUpInside
        )
        doneButton.accessibilityHint =
            "Enter some text before adding it to the canvas."
        doneButton.configurationUpdateHandler = { button in
            var configuration = button.configuration
            configuration?.baseForegroundColor = button.isEnabled
                ? Self.ink
                : UIColor(
                    red: 108 / 255,
                    green: 98 / 255,
                    blue: 86 / 255,
                    alpha: 1
                )
            configuration?.baseBackgroundColor = button.isEnabled
                ? UIColor(
                    red: 234 / 255,
                    green: 220 / 255,
                    blue: 195 / 255,
                    alpha: 1
                )
                : UIColor(
                    red: 232 / 255,
                    green: 225 / 255,
                    blue: 214 / 255,
                    alpha: 1
                )
            button.configuration = configuration
            button.accessibilityValue = button.isEnabled
                ? "Available"
                : "Unavailable until text is entered"
        }
        let header = UIStackView(arrangedSubviews: [
            titleLabel,
            UIView(),
            cancelButton,
        ])
        header.axis = .horizontal
        header.alignment = .top
        header.spacing = 18

        methodControl.backgroundColor = .clear
        methodControl.accessibilityLabel = "Text input method"
        methodControl.layer.borderColor = Self.warmBorder.cgColor
        methodControl.layer.borderWidth = 1
        methodControl.layer.cornerRadius = 14
        methodControl.clipsToBounds = true

        configureMethodButton(
            voiceMethodButton,
            title: "Voice",
            systemImage: "mic.fill",
            action: #selector(voiceMethodTapped)
        )
        configureMethodButton(
            keyboardMethodButton,
            title: "Keyboard",
            systemImage: "keyboard",
            action: #selector(keyboardMethodTapped)
        )
        let methodDivider = UIView()
        methodDivider.backgroundColor = Self.warmBorder.withAlphaComponent(0.55)
        let methodButtons = UIStackView(arrangedSubviews: [
            voiceMethodButton,
            methodDivider,
            keyboardMethodButton,
        ])
        methodButtons.axis = .horizontal
        methodButtons.distribution = .fill
        methodButtons.spacing = 0
        methodButtons.translatesAutoresizingMaskIntoConstraints = false
        methodControl.addSubview(methodButtons)
        NSLayoutConstraint.activate([
            methodButtons.leadingAnchor.constraint(
                equalTo: methodControl.leadingAnchor,
                constant: 3
            ),
            methodButtons.trailingAnchor.constraint(
                equalTo: methodControl.trailingAnchor,
                constant: -3
            ),
            methodButtons.topAnchor.constraint(
                equalTo: methodControl.topAnchor,
                constant: 3
            ),
            methodButtons.bottomAnchor.constraint(
                equalTo: methodControl.bottomAnchor,
                constant: -3
            ),
            voiceMethodButton.widthAnchor.constraint(
                equalTo: keyboardMethodButton.widthAnchor
            ),
            methodDivider.widthAnchor.constraint(equalToConstant: 1),
        ])

        textView.text = state.text
        textView.delegate = self
        textView.backgroundColor = .white
        textView.layer.borderColor = Self.warmBorder.cgColor
        textView.layer.borderWidth = 1
        textView.layer.cornerRadius = 14
        textView.textColor = .black
        textView.font = UIFontMetrics(forTextStyle: .title1).scaledFont(
            for: UIFont.systemFont(ofSize: 38)
        )
        textView.adjustsFontForContentSizeCategory = true
        textView.tintColor = UIColor(
            red: 198 / 255,
            green: 47 / 255,
            blue: 34 / 255,
            alpha: 1
        )
        textView.textContainerInset = UIEdgeInsets(
            top: 18,
            left: 16,
            bottom: 18,
            right: 16
        )
        textView.accessibilityLabel = "Text for the page"
        textView.inputView =
            state.inputMethod == .keyboard ? nil : keyboardSpacer
        textView.inputAssistantItem.leadingBarButtonGroups = []
        textView.inputAssistantItem.trailingBarButtonGroups = []

        var voiceConfiguration = UIButton.Configuration.bordered()
        voiceConfiguration.title = "Tap to begin speaking"
        voiceConfiguration.image = UIImage(
            systemName: "mic.fill",
            withConfiguration: UIImage.SymbolConfiguration(
                pointSize: 22,
                weight: .semibold
            )
        )
        voiceConfiguration.imagePadding = 10
        voiceConfiguration.baseForegroundColor = Self.readyGreenText
        voiceConfiguration.baseBackgroundColor = Self.readyGreenBackground
        voiceConfiguration.background.strokeColor = Self.readyGreenBorder
        voiceConfiguration.background.strokeWidth = 2
        voiceConfiguration.cornerStyle = .large
        let voiceFont = UIFontMetrics(forTextStyle: .body).scaledFont(
            for: UIFont.systemFont(ofSize: 17, weight: .heavy)
        )
        voiceConfiguration.titleTextAttributesTransformer =
            UIConfigurationTextAttributesTransformer { attributes in
                var attributes = attributes
                attributes.font = voiceFont
                return attributes
            }
        voiceButton.configuration = voiceConfiguration
        voiceButton.titleLabel?.adjustsFontForContentSizeCategory = true
        voiceButton.titleLabel?.numberOfLines = 0
        voiceButton.titleLabel?.textAlignment = .center
        voiceButton.addTarget(
            self,
            action: #selector(voiceTapped),
            for: .touchUpInside
        )
        voiceButton.accessibilityHint =
            "Records your voice and inserts the recognized words at the cursor."

        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .left
        statusLabel.textColor = UIColor(
            red: 109 / 255,
            green: 80 / 255,
            blue: 50 / 255,
            alpha: 1
        )

        actionsStack.addArrangedSubview(methodControl)
        actionsStack.addArrangedSubview(voiceButton)
        actionsStack.addArrangedSubview(doneButton)
        actionsStack.axis = .horizontal
        actionsStack.alignment = .fill
        actionsStack.spacing = 16
        methodControl.setContentHuggingPriority(.required, for: .horizontal)
        methodControl.setContentCompressionResistancePriority(
            .required,
            for: .horizontal
        )
        voiceButton.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        doneButton.setContentHuggingPriority(.required, for: .horizontal)

        let stack = UIStackView(arrangedSubviews: [
            header,
            actionsStack,
            statusLabel,
            microphoneMeter,
            textView,
        ])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        cardView.addSubview(stack)

        let availableGuide = UILayoutGuide()
        view.addLayoutGuide(availableGuide)
        NSLayoutConstraint.activate([
            availableGuide.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.topAnchor
            ),
            availableGuide.bottomAnchor.constraint(
                equalTo: view.keyboardLayoutGuide.topAnchor
            ),
            availableGuide.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor
            ),
            availableGuide.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor
            ),
            methodControl.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
            voiceButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            doneButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 160),
            cancelButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            statusLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 24),
            textView.heightAnchor.constraint(greaterThanOrEqualToConstant: 160),
            cardView.widthAnchor.constraint(lessThanOrEqualToConstant: 920),
            cardView.heightAnchor.constraint(lessThanOrEqualToConstant: 960),
            cardView.leadingAnchor.constraint(
                greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 18
            ),
            cardView.trailingAnchor.constraint(
                lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -18
            ),
            cardView.topAnchor.constraint(
                greaterThanOrEqualTo: view.safeAreaLayoutGuide.topAnchor,
                constant: 18
            ),
            cardView.bottomAnchor.constraint(
                lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor,
                constant: -18
            ),
            cardView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cardView.centerYAnchor.constraint(
                equalTo: availableGuide.centerYAnchor
            ),
            stack.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -28),
        ])
        methodControlWidthConstraint =
            methodControl.widthAnchor.constraint(equalToConstant: 380)
        methodControlWidthConstraint?.isActive = true
        voiceButtonWidthConstraint =
            voiceButton.widthAnchor.constraint(equalToConstant: 220)
        voiceButtonWidthConstraint?.isActive = true
        cardWidthConstraint =
            cardView.widthAnchor.constraint(equalToConstant: 920)
        cardWidthConstraint?.isActive = true
        let microphoneMeterHeight =
            microphoneMeter.heightAnchor.constraint(equalToConstant: 38)
        microphoneMeterHeight.priority = .defaultHigh
        microphoneMeterHeight.isActive = true
        let preferredHeight = cardView.heightAnchor.constraint(equalToConstant: 900)
        preferredHeight.priority = .defaultHigh
        preferredHeight.isActive = true
    }

    public func textViewDidChange(_ textView: UITextView) {
        state.update(text: textView.text, selection: textView.selectedRange)
        renderState()
    }

    public func textViewDidChangeSelection(_ textView: UITextView) {
        state.update(text: textView.text, selection: textView.selectedRange)
    }

    public func textViewDidBeginEditing(_ textView: UITextView) {
        textView.layer.borderColor = UIColor(
            red: 159 / 255,
            green: 40 / 255,
            blue: 31 / 255,
            alpha: 1
        ).cgColor
        textView.layer.borderWidth = 3
    }

    public func textViewDidEndEditing(_ textView: UITextView) {
        textView.layer.borderColor = Self.warmBorder.cgColor
        textView.layer.borderWidth = 1
    }

    @objc private func voiceMethodTapped() {
        selectInputMethod(.voice)
    }

    @objc private func keyboardMethodTapped() {
        selectInputMethod(.keyboard)
    }

    private func selectInputMethod(_ method: NativeTextInputMethod) {
        guard method != state.inputMethod else {
            if method == .keyboard, !textView.isFirstResponder {
                textView.becomeFirstResponder()
            }
            return
        }
        let selection = textView.selectedRange
        state.selectInputMethod(method)
        for action in NativeKeyboardSessionCoordinator.transition(to: method) {
            switch action {
            case .resignFirstResponder:
                textView.resignFirstResponder()
            case .useHiddenInputView:
                textView.inputView = keyboardSpacer
            case .useSystemInputView:
                textView.inputView = nil
            case .reloadInputViews:
                textView.reloadInputViews()
            case .setEditable(let editable):
                textView.isEditable = editable
            case .becomeFirstResponder:
                textView.becomeFirstResponder()
            case .restoreSelection:
                textView.selectedRange = selection
            }
        }
        renderState()
    }

    @objc private func voiceTapped() {
        guard let voiceCoordinator else {
            state.fail("Voice entry is unavailable. Use the keyboard.")
            renderState()
            return
        }
        switch state.phase {
        case .recording:
            stopAndTranscribe(using: voiceCoordinator)
        case .ready, .error:
            startRecording(using: voiceCoordinator)
        case .transcribing:
            return
        }
    }

    private func startRecording(using coordinator: NativeTextVoiceCoordinator) {
        recordingStartTask?.cancel()
        state.update(text: textView.text, selection: textView.selectedRange)
        state.beginLiveTranscription()
        renderState()
        recordingStartTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await coordinator.start(
                    localeIdentifier: localeIdentifier,
                    contextualStrings: contextualStrings,
                    onEvent: { [weak self, weak coordinator] event in
                        guard let self else { return }
                        switch event {
                        case .provisional(_, let text, _):
                            guard state.phase == .recording else { return }
                            state.updateLivePreview(text)
                            scheduleProvisionalRender()
                        case .finalized(_, let text, _):
                            state.updateLiveFinalized(text)
                            provisionalRenderTask?.cancel()
                            provisionalRenderTask = nil
                            textView.text = state.text
                            textView.selectedRange = state.selection
                        case .failed(_, let error):
                            guard state.phase == .recording ||
                                    state.phase == .transcribing else { return }
                            recordingLimitTask?.cancel()
                            coordinator?.cancel()
                            state.failLiveTranscription(
                                error.localizedDescription
                            )
                            textView.text = state.text
                            textView.selectedRange = state.selection
                            renderState()
                        }
                    }
                )
                guard !Task.isCancelled else {
                    coordinator.cancel()
                    state.cancelLiveTranscription()
                    return
                }
                recordingStartTask = nil
                scheduleRecordingLimit(using: coordinator)
            } catch {
                guard !Task.isCancelled else { return }
                state.failLiveTranscription(error.localizedDescription)
                textView.text = state.text
                textView.selectedRange = state.selection
            }
            renderState()
            recordingStartTask = nil
        }
    }

    private func scheduleProvisionalRender() {
        guard provisionalRenderTask == nil else { return }
        provisionalRenderTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 120_000_000)
            guard !Task.isCancelled, let self else { return }
            textView.text = state.text
            textView.selectedRange = state.selection
            provisionalRenderTask = nil
        }
    }

    private func scheduleRecordingLimit(
        using coordinator: NativeTextVoiceCoordinator
    ) {
        recordingLimitTask?.cancel()
        guard let milliseconds = recordingLimitMilliseconds,
              milliseconds > 0 else { return }
        recordingLimitTask = Task { @MainActor [weak self] in
            try? await Task.sleep(
                nanoseconds: UInt64(milliseconds) * 1_000_000
            )
            guard !Task.isCancelled, self?.state.phase == .recording else {
                return
            }
            self?.stopAndTranscribe(using: coordinator)
        }
    }

    private func stopAndTranscribe(
        using coordinator: NativeTextVoiceCoordinator
    ) {
        if let recordingStartTask {
            recordingStartTask.cancel()
            self.recordingStartTask = nil
            coordinator.cancel()
            state.cancelLiveTranscription()
            renderState()
            return
        }
        recordingLimitTask?.cancel()
        provisionalRenderTask?.cancel()
        provisionalRenderTask = nil
        textView.text = state.text
        textView.selectedRange = state.selection
        state.beginTranscribing()
        renderState()
        transcriptionTask?.cancel()
        transcriptionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let spoken = try await coordinator.stop()
                state.finishLiveTranscription(spoken)
                textView.text = state.text
                textView.selectedRange = state.selection
            } catch {
                guard !Task.isCancelled else {
                    transcriptionTask = nil
                    return
                }
                state.failLiveTranscription(error.localizedDescription)
                textView.text = state.text
                textView.selectedRange = state.selection
            }
            renderState()
            transcriptionTask = nil
        }
    }

    @objc private func applicationDidEnterBackground() {
        guard state.phase == .recording ||
                state.phase == .transcribing,
              let voiceCoordinator else { return }
        recordingLimitTask?.cancel()
        recordingStartTask?.cancel()
        transcriptionTask?.cancel()
        provisionalRenderTask?.cancel()
        voiceCoordinator.cancel()
        state.failLiveTranscription(
            "Voice entry stopped when the app moved to the background. Your text is unchanged."
        )
        textView.text = state.text
        textView.selectedRange = state.selection
        renderState()
    }

    @objc private func cancelTapped() {
        recordingStartTask?.cancel()
        transcriptionTask?.cancel()
        provisionalRenderTask?.cancel()
        voiceCoordinator?.cancel()
        state.cancelLiveTranscription()
        finish(with: NativeTextEditorResult(cancelled: true, text: state.text))
    }

    @objc private func doneTapped() {
        guard state.canSubmit else { return }
        state.update(text: textView.text, selection: textView.selectedRange)
        finish(with: NativeTextEditorResult(
            cancelled: false,
            text: state.text.trimmingCharacters(in: .whitespacesAndNewlines)
        ))
    }

    private func finish(with result: NativeTextEditorResult) {
        completed = true
        recordingLimitTask?.cancel()
        recordingStartTask?.cancel()
        transcriptionTask?.cancel()
        voiceCoordinator?.cancel()
        microphoneMeter.stop()
        view.endEditing(true)
        dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [onComplete] in
            onComplete?(result)
        }
    }

    private func renderState() {
        cancelButton.isEnabled = true
        doneButton.isHidden = !state.shouldShowSubmitAction(for: mode)
        doneButton.isEnabled = state.canSubmit
        methodControl.isUserInteractionEnabled = state.canCancel
        updateMethodButtonSelection()
        textView.isEditable =
            state.canCancel && state.inputMethod == .keyboard
        textView.isSelectable = state.canCancel
        voiceButton.isHidden = state.inputMethod == .keyboard

        switch state.phase {
        case .ready:
            statusLabel.isHidden = true
            statusLabel.text = nil
            if state.inputMethod == .voice {
                microphoneMeter.start(
                    accessibilityValue: "Voice mode ready"
                ) { [weak voiceCoordinator] in
                    voiceCoordinator?.currentPowerLevel ?? 0
                }
            } else {
                microphoneMeter.stop()
            }
            voiceButton.configuration?.title = "Tap to begin speaking"
            voiceButton.configuration?.baseForegroundColor = Self.readyGreenText
            voiceButton.configuration?.baseBackgroundColor =
                Self.readyGreenBackground
            voiceButton.configuration?.background.strokeColor =
                Self.readyGreenBorder
            voiceButton.isEnabled = state.inputMethod == .voice
            voiceButton.accessibilityValue = "Not recording"
        case .recording:
            statusLabel.isHidden = false
            microphoneMeter.start(accessibilityValue: "Recording") {
                [weak voiceCoordinator] in
                voiceCoordinator?.currentPowerLevel ?? 0
            }
            statusLabel.text = "Listening. Words appear as you speak."
            voiceButton.configuration?.title = "Stop listening"
            voiceButton.configuration?.baseForegroundColor = UIColor(
                red: 114 / 255,
                green: 38 / 255,
                blue: 30 / 255,
                alpha: 1
            )
            voiceButton.configuration?.baseBackgroundColor = UIColor(
                red: 232 / 255,
                green: 110 / 255,
                blue: 97 / 255,
                alpha: 1
            )
            voiceButton.configuration?.background.strokeColor = UIColor(
                red: 163 / 255,
                green: 71 / 255,
                blue: 60 / 255,
                alpha: 1
            )
            voiceButton.isEnabled = true
            voiceButton.accessibilityValue = "Recording"
        case .transcribing:
            statusLabel.isHidden = false
            microphoneMeter.stop()
            statusLabel.text = "Finishing your text…"
            voiceButton.configuration?.title = "Finishing…"
            voiceButton.configuration?.baseBackgroundColor = UIColor(
                red: 1,
                green: 241 / 255,
                blue: 236 / 255,
                alpha: 1
            )
            voiceButton.isEnabled = false
            voiceButton.accessibilityValue = "Transcribing"
        case .error(let message):
            statusLabel.isHidden = false
            if state.inputMethod == .voice {
                microphoneMeter.start(
                    accessibilityValue: "Voice mode ready"
                ) { [weak voiceCoordinator] in
                    voiceCoordinator?.currentPowerLevel ?? 0
                }
            } else {
                microphoneMeter.stop()
            }
            statusLabel.text = message
            voiceButton.configuration?.title = "Try speaking again"
            voiceButton.configuration?.baseForegroundColor = UIColor(
                red: 114 / 255,
                green: 38 / 255,
                blue: 30 / 255,
                alpha: 1
            )
            voiceButton.configuration?.baseBackgroundColor = UIColor(
                red: 1,
                green: 241 / 255,
                blue: 236 / 255,
                alpha: 1
            )
            voiceButton.isEnabled = state.inputMethod == .voice
            voiceButton.accessibilityValue = "Not recording"
        }
        if state.phase != .ready,
           let status = statusLabel.text,
           status != lastAnnouncedStatus {
            lastAnnouncedStatus = status
            UIAccessibility.post(notification: .announcement, argument: status)
        }
    }

    private func updateMethodButtonSelection() {
        let selections: [(UIButton, Bool)] = [
            (voiceMethodButton, state.inputMethod == .voice),
            (keyboardMethodButton, state.inputMethod == .keyboard),
        ]
        for (button, selected) in selections {
            let foregroundColor = selected
                ? Self.ink
                : UIColor(
                    red: 85 / 255,
                    green: 62 / 255,
                    blue: 39 / 255,
                    alpha: 1
                )
            button.backgroundColor = selected
                ? UIColor(
                    red: 234 / 255,
                    green: 220 / 255,
                    blue: 195 / 255,
                    alpha: 1
                )
                : .clear
            button.configuration?.baseForegroundColor = foregroundColor
            button.tintColor = foregroundColor
            if selected {
                button.accessibilityTraits.insert(.selected)
            } else {
                button.accessibilityTraits.remove(.selected)
            }
        }
    }
}
#endif
