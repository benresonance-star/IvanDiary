# Product invariants

These rules describe the current product constraint. Coverage details belong in the [test matrix](../TEST_MATRIX.md).

1. **Original recordings are preserved.** `VoiceRecordingObject.asset` and `TranscriptObject.recordingId` are separate; `JournalPage.transcribeVoice` and `MyStoryWorkspace.transcribeVoice` add/update transcript state without replacing audio. Swift tests `atomicFinalizationProducesOriginalIntegrityMetadataAndTrashIsRecoverable` and transcription result tests provide partial evidence; physical interruption/transcription gates remain.
2. **Transcription is explicit.** `TranscriptionStatus` starts at
   `not-requested`, and the saved-recording handlers call
   `AppleTranscriptionPlugin.transcribe` only after an explicit request.
   However, `AudioCard.tsx` does not render its `onConvertToText` action and
   focused tests expect playback-only cards. The intended **Convert to text**
   interaction remains an implementation gap.
3. **Editable PencilKit data is drawing authority.** `NativeDrawingViewController` reads/writes `PKDrawing`; `PencilKitPreview.previewUri` is derivative. Native overlay tests and `NativeDrawingGesturePolicyTests` are partial evidence; physical Pencil gates remain.
4. **Local durability precedes “saved.”** `NativeJournalRepository.commit` writes through `NativeJournalStorePlugin` before advancing state. `nativeJournalRepository.test.ts` verifies atomic persistence, damage recovery and failed-write behavior.
5. **Conflicts are never silently resolved.** `useBackupSync` detects another device/content fingerprint and reports that nothing was overwritten; `SettingsView.test.tsx` verifies the UI does not choose between iPads. Merge/winner policy remains unresolved.
6. **Deletion/history are recoverable only as implemented.** Cloud recovery points and before-restore safety entries exist; `confirmCloudDataDeletion` requires two warnings. Native assets can move to trash. No promise of indefinite retention is established.
7. **Generated text is not silently canonical.** `TranscriptObject` keeps `rawText` and optional `editedText`; transcription status/failure does not modify the recording. Editing is user-controlled.
8. **Finger and accessibility interaction remain supported.** `PencilKitPlugin` exposes `fingerDrawing`; controls use semantic accessible interactions. Automated component and gesture-policy tests are partial; VoiceOver/Switch Control require hardware.
9. **Hardware/OS baseline stays explicit.** The Xcode target is iPad-only (`TARGETED_DEVICE_FAMILY = 2`), with first-generation iPad Pro and iPadOS 15 compatibility requirements. iPhone is future intent, not current support.
10. **Documentation work does not alter runtime behavior.** Product, schema, conflict or platform decisions discovered while documenting must be recorded for approval, not implemented.

When evidence contradicts an invariant, stop and report the implementation, test and product sources rather than silently choosing a new policy.
