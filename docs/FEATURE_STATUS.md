# Feature status

Evidence was last checked at commit `fe5c9e171cd34e384f304000e99351b098e73ed7` on 2026-08-25. Status terms are limited to **Implemented**, **Partial**, **Manual gate**, **Proposed**, **Deferred**, and **Unresolved**. A physical gate is not marked passed.

## Inventory

### Page lifecycle — Implemented
- **Implementation:** `src/domain/operations.ts` (`applyDocumentOperation` and page create/reorder/delete operations), `src/hooks/useJournal.ts`, `src/components/DiaryPageStrip.tsx`.
- **Automated:** `src/domain/operations.test.ts` (“creates and orders a page…”, “deletes a journal page…”); `src/components/DiaryPageStrip.test.tsx`.
- **Manual/gap:** force-close and relaunch remain physical checks.

### Local persistence — Implemented
- **Implementation:** `src/repository/nativeJournalRepository.ts` (`NativeJournalRepository.commit`, `replace`), `src/repository/browserJournalRepository.ts`.
- **Automated:** `src/repository/nativeJournalRepository.test.ts` (“atomically persists operations and recovers a damaged latest snapshot”, “does not advance in-memory state when the atomic write fails”); browser repository tests.
- **Manual/gap:** backgrounding and device-storage failure behavior require physical acceptance.

### Drawing — Manual gate
- **Implementation:** `src/hooks/useNativeDrawingOverlay.ts`, `src/native/pencilKit.ts`, `packages/ApplePlatformServices/Sources/AppleDrawingKit/NativeDrawingViewController.swift`. Editable `.pkdrawing` data is authoritative; previews are derived.
- **Automated:** `src/hooks/useNativeDrawingOverlay.test.ts`, `src/sketch/NativeSketchPreview.test.tsx`, `NativeDrawingGesturePolicyTests.swift`.
- **Manual/gap:** Pencil latency, palm/finger behavior, overlays, relaunch and first-generation iPad Pro are unperformed physical gates.

### Recording — Manual gate
- **Implementation:** `src/components/VoiceRecordingDialog.tsx`, `src/native/durableAudio.ts`, `JournalAudioPlugin`, Apple audio services.
- **Automated:** `VoiceRecordingDialog.test.tsx`; `durableAudio.test.ts`; Swift tests `recordingTransitionsAndInterruptionRecovery` and `atomicFinalizationProducesOriginalIntegrityMetadataAndTrashIsRecoverable`.
- **Manual/gap:** real microphone, interruptions and low storage.

### Playback — Manual gate
- **Implementation:** `src/components/AudioCard.tsx`, `JournalAudioPlugin.play`, `pausePlayback`, and `playbackEnded`.
- **Automated:** `src/components/AudioCard.test.tsx`.
- **Manual/gap:** hardware audio routing and long recordings.

### Transcription — Partial
- **Implementation:** `JournalPage.transcribeVoice`, `MyStoryWorkspace.transcribeVoice`, `AppleTranscriptionPlugin`, `AppleSpeechTranscriber.transcribe`.
- **Automated:** Apple audio-service transcription tests and `src/native/ephemeralTranscription.test.ts`.
- **Manual/gap:** saved audio is preserved and the handlers require an explicit
  request, but `AudioCard.tsx` does not render its `onConvertToText` action;
  focused tests expect playback-only cards. The intended saved-recording
  **Convert to text** interaction is not currently reachable through that card.
  Speech permissions, device API selection and failure recovery also remain
  physical gates.

### CloudKit backup — Partial
- **Implementation:** `src/hooks/useBackupSync.ts`, `CloudBackupPlugin`, and app-target `CloudBackupPlugin` implementation in `ios/App/App/JournalAudioPlugins.swift`.
- **Automated:** `src/hooks/backupSyncHelpers.test.ts` and `src/native/composition.test.ts` cover pure helpers/contracts, not CloudKit.
- **Manual/gap:** app-target CloudKit code has no direct automated test; iCloud account, network and quota behavior require physical testing.

### Recovery and history — Partial
- **Implementation:** `useBackupSync.restoreFromCloud`, `restoreHistoryEntry`, `reconcileCloudRestore`, CloudKit history methods.
- **Automated:** `src/domain/cloudRestore.test.ts` verifies migration, asset replacement and rejection of incomplete restores; helper tests cover same-day safety points.
- **Manual/gap:** CloudKit round trip and corrupt/missing cloud assets require physical testing.

### Multi-device behavior — Unresolved
- **Implementation:** `useBackupSync` compares device identity/content fingerprints and refuses silent overwrite; Settings offers explicit local/iCloud choices.
- **Automated:** `SettingsView.test.tsx` (“does not choose between two iPads without the user”).
- **Manual/gap:** no approved merge, winner, retention or complete conflict policy; two-iPad gate not run.

### My Story — Implemented
- **Implementation:** `src/components/MyStoryWorkspace.tsx`, story operations in `src/domain/operations.ts`.
- **Automated:** `MyStoryWorkspace.test.tsx` covers durable voice, content, links and sharing; operations and migration tests cover persistence.
- **Manual/gap:** full native drawing/audio/share checks remain physical.

### Shapes — Implemented
- **Implementation:** `ShapeObject`, `ShapeEditor.tsx`, `PolygonDraftEditor.tsx`, shape operations.
- **Automated:** `ShapeEditor.test.tsx`, `ShapeCard.test.tsx`, `FreeformDraftEditor.test.tsx`, operations/migration tests; `JournalPage.test.tsx` verifies that complete-paper sharing keeps text and both shape layers mounted while requesting WebView capture.
- **Manual/gap:** touch/Pencil ergonomics and rendered JPG/PDF output need device review.

### Accessibility — Manual gate
- **Implementation:** semantic React controls, accessibility settings, keyboard actions and Swift gesture policy.
- **Automated:** `src/components/accessibility.test.tsx`, component interaction tests, lint via `eslint-plugin-jsx-a11y`.
- **Manual/gap:** VoiceOver, Switch Control, Dynamic Type/layout, high contrast and reduced motion require the physical checklist.

### iPhone — Proposed
- **Implementation:** none as a supported app target; Xcode uses `TARGETED_DEVICE_FAMILY = 2`.
- **Automated/manual:** none.
- **Gap:** product intent mentions iPhone, but current implementation and acceptance baseline are iPad-only.

### Release readiness — Manual gate
- **Automated:** `npm run validate`, Swift package tests and an unsigned simulator composition build provide non-device evidence.
- **Manual/gap:** every gate in [physical iPad acceptance](../Specs/physical-ipad-acceptance.md) remains separately required and is not claimed passed.

See [current state](CURRENT_STATE.md), [architecture](architecture/INDEX.md), and the [test matrix](TEST_MATRIX.md).
