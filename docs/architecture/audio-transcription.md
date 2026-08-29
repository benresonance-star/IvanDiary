# Audio and transcription

## Current implementation

1. `VoiceRecordingDialog` requests monitoring/recording through `JournalAudioPlugin`.
2. Native audio is written to a temporary app-controlled recording and finalized as an `AssetRef`; `durableAudio.ts` verifies the result before a voice object is added.
3. The saved voice object retains the original asset and can be played through `JournalAudioPlugin.play`/`pausePlayback`; `AudioCard` presents playback.
4. Transcription remains `not-requested` after saving.
   `JournalPage.transcribeVoice` and `MyStoryWorkspace.transcribeVoice` contain
   the explicit request flow: permission, progress,
   `AppleTranscriptionPlugin.transcribe`, and separate transcript text.
   `AudioCard.tsx` does not currently render the supplied `onConvertToText`
   action, so the intended **Convert to text** path is not reachable from a
   saved voice card.
5. Transcript edits change text content; they do not overwrite or delete original audio.

Recording state and transport are typed in `src/native/contracts.ts`. Apple package services implement audio finalization and `AppleSpeechTranscriber.transcribe`; app-target Capacitor plugins compose those services. Browser behavior is a simulation.

## Failure behavior and evidence

- `VoiceRecordingDialog.test.tsx` covers cancel, pause/review/place and finalization interaction.
- `durableAudio.test.ts` protects durable asset handling.
- Swift tests cover recording/interruption transitions, recovered finalization, idempotent finalization, stable speech errors and transcription result metadata.
- Permission denial, no speech or transcription failure leave the voice asset intact and can set a failed status.

This is an implementation gap as well as a coverage gap:
`AudioCard.test.tsx` expects playback-only cards. Physical checks for
microphone routing, interruption recovery, permissions, first-generation iPad
Pro speech compatibility and newer API fallback are also not reported as
passed.

Live speech inside the native text editor is a separate ephemeral entry path. It must preserve the pre-voice draft on failure/cancel and remove temporary audio; it does not change the saved-recording rule above.
