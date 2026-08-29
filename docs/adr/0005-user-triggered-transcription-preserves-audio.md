# ADR 0005: User-triggered transcription preserves audio

## Status

Accepted

## Date

2026-08-25

## Context

Audio is original journal source material; a transcript is an editable derivative. Older product wording implies transcription follows stopping a recording automatically. Current orchestration instead exposes transcription through an explicit `onConvertToText` action after the recording has been finalized. The approved Phase 0 review also found that the current `JournalPage` recording card does not render the **Convert to text** control, despite the handler and acceptance requirement.

## Decision

Stopping a recording saves and preserves the original audio without automatically transcribing it. Transcription begins only after an explicit user request labelled **Convert to text**. Transcript creation, editing, retry, or failure must not replace, mutate, or make saving contingent on the original recording. The missing rendered action is a current UI gap, not permission in this documentation-only change to alter runtime behavior.

## Alternatives or prior direction

- Automatic transcription after Stop is superseded because it removes explicit user control and conflicts with current orchestration and acceptance criteria.
- Replacing audio with transcript text is rejected because transcription is derivative and fallible.
- Adding the missing rendered control now is outside this ADR-only change.

## Consequences

- Audio remains independently playable and durable before and after transcription.
- Denied permission, unavailable recognition, errors, and retries must leave the recording intact.
- UI and accessibility work must render a discoverable semantic **Convert to text** action before the explicit flow can be considered complete in `JournalPage`.
- Browser transcription remains a clearly labelled simulation.

## Evidence

- `src/components/JournalPage.tsx::transcribeVoice` and `src/components/MyStoryWorkspace.tsx::transcribeVoice` implement explicit transcription handlers passed as `onConvertToText`.
- `src/native/durableAudio.ts` and native file services preserve the recording independently from transcription.
- `Specs/physical-ipad-acceptance.md` requires that a saved recording does not transcribe until **Convert to text** is selected.
- The approved Phase 0 follow-up inspection identifies the missing rendered `JournalPage` action.

## Superseded documents

- `Specs/ivans-journal-spec.md` wording that implies Apple transcription is requested automatically after Stop.
- Any automatic-transcription implication in historical planning is superseded; its audio-preservation requirements remain valid.
