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

    func start(levelProvider: @escaping () -> Float) {
        self.levelProvider = levelProvider
        guard timer == nil else { return }
        isHidden = false
        accessibilityValue = "Recording"
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
        let level = CGFloat(min(1, max(0, levelProvider?() ?? 0)))
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
    private var transcriptionTask: Task<Void, Never>?
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
        voiceCoordinator: NativeTextVoiceCoordinator? = try? NativeTextVoiceCoordinator()
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
        UIAccessibility.post(
            notification: .screenChanged,
            argument: methodControl
        )
    }

    public override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if !completed {
            recordingLimitTask?.cancel()
            transcriptionTask?.cancel()
            microphoneMeter.stop()
            voiceCoordinator?.cancel()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        actionsStack.axis =
            cardView.bounds.width < 820 ||
            traitCollection.preferredContentSizeCategory.isAccessibilityCategory
            ? .vertical
            : .horizontal
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

        methodControl.backgroundColor = UIColor(
            red: 234 / 255,
            green: 219 / 255,
            blue: 195 / 255,
            alpha: 1
        )
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
        let methodButtons = UIStackView(arrangedSubviews: [
            voiceMethodButton,
            keyboardMethodButton,
        ])
        methodButtons.axis = .horizontal
        methodButtons.distribution = .fillEqually
        methodButtons.spacing = 2
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
        textView.inputView = keyboardSpacer

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
            methodControl.widthAnchor.constraint(equalToConstant: 280),
            voiceButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            voiceButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 260),
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
        let microphoneMeterHeight =
            microphoneMeter.heightAnchor.constraint(equalToConstant: 38)
        microphoneMeterHeight.priority = .defaultHigh
        microphoneMeterHeight.isActive = true
        let preferredWidth = cardView.widthAnchor.constraint(equalToConstant: 920)
        preferredWidth.priority = .defaultHigh
        preferredWidth.isActive = true
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
        if state.phase == .recording {
            stopAndTranscribe(using: voiceCoordinator)
        } else {
            startRecording(using: voiceCoordinator)
        }
    }

    private func startRecording(using coordinator: NativeTextVoiceCoordinator) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await coordinator.start(
                    maximumDurationMilliseconds: recordingLimitMilliseconds
                )
                state.beginRecording()
                scheduleRecordingLimit(using: coordinator)
            } catch {
                state.fail(error.localizedDescription)
            }
            renderState()
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
        recordingLimitTask?.cancel()
        state.update(text: textView.text, selection: textView.selectedRange)
        let stateBeforeTranscription = state
        state.beginTranscribing()
        renderState()
        transcriptionTask?.cancel()
        transcriptionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let spoken = try await coordinator.stopAndTranscribe(
                    localeIdentifier: localeIdentifier,
                    contextualStrings: contextualStrings,
                    onPartialResult: { [weak self] partialText in
                        guard let self else { return }
                        var previewState = stateBeforeTranscription
                        previewState.finishTranscribing(partialText)
                        previewState.beginTranscribing()
                        state = previewState
                        textView.text = state.text
                        textView.selectedRange = state.selection
                        renderState()
                    }
                )
                state = stateBeforeTranscription
                state.finishTranscribing(spoken)
                textView.text = state.text
                textView.selectedRange = state.selection
            } catch {
                state.fail(error.localizedDescription)
            }
            renderState()
            transcriptionTask = nil
        }
    }

    @objc private func applicationDidEnterBackground() {
        guard state.phase == .recording, let voiceCoordinator else { return }
        stopAndTranscribe(using: voiceCoordinator)
    }

    @objc private func cancelTapped() {
        guard state.canCancel else { return }
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
        transcriptionTask?.cancel()
        microphoneMeter.stop()
        view.endEditing(true)
        dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [onComplete] in
            onComplete?(result)
        }
    }

    private func renderState() {
        cancelButton.isEnabled = state.canCancel
        doneButton.isHidden = !state.shouldShowSubmitAction(for: mode)
        doneButton.isEnabled = state.canSubmit
        methodControl.isUserInteractionEnabled = state.canCancel
        voiceMethodButton.isEnabled = state.canCancel
        keyboardMethodButton.isEnabled = state.canCancel
        updateMethodButtonSelection()
        textView.isEditable = state.canCancel
        voiceButton.isHidden = state.inputMethod == .keyboard

        switch state.phase {
        case .ready:
            microphoneMeter.stop()
            statusLabel.text = state.inputMethod == .voice
                ? "Ready to listen"
                : "Keyboard ready"
            voiceButton.configuration?.title = "Tap to begin speaking"
            voiceButton.configuration?.baseForegroundColor = Self.readyGreenText
            voiceButton.configuration?.baseBackgroundColor =
                Self.readyGreenBackground
            voiceButton.configuration?.background.strokeColor =
                Self.readyGreenBorder
            voiceButton.isEnabled = state.inputMethod == .voice
            voiceButton.accessibilityValue = "Not recording"
        case .recording:
            microphoneMeter.start { [weak voiceCoordinator] in
                voiceCoordinator?.currentPowerLevel ?? 0
            }
            statusLabel.text = "Listening. Tap Stop when you are finished."
            voiceButton.configuration?.title = "Stop and turn voice into text"
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
            microphoneMeter.stop()
            statusLabel.text = "Turning your voice into text…"
            voiceButton.configuration?.title = "Working…"
            voiceButton.configuration?.baseBackgroundColor = UIColor(
                red: 1,
                green: 241 / 255,
                blue: 236 / 255,
                alpha: 1
            )
            voiceButton.isEnabled = false
            voiceButton.accessibilityValue = "Transcribing"
        case .error(let message):
            microphoneMeter.stop()
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
            button.isSelected = selected
            button.backgroundColor = selected ? Self.warmPaper : .clear
            button.configuration?.baseForegroundColor = selected
                ? Self.ink
                : UIColor(
                    red: 85 / 255,
                    green: 62 / 255,
                    blue: 39 / 255,
                    alpha: 1
                )
            if selected {
                button.accessibilityTraits.insert(.selected)
            } else {
                button.accessibilityTraits.remove(.selected)
            }
        }
    }
}
#endif
