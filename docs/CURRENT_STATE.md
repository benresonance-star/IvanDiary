# Current state

**Last verified:** 2026-08-25  
**Verified checkpoint:** branch `codex/durable-native-audio`, commit [`fe5c9e171cd34e384f304000e99351b098e73ed7`](https://github.com/benresonance-star/IvanDiary/tree/fe5c9e171cd34e384f304000e99351b098e73ed7), draft PR [#4](https://github.com/benresonance-star/IvanDiary/pull/4).

This checkpoint is 21 commits ahead of `main` and has no commits from `main` missing from it. `main` therefore does not describe the active implementation. Recheck this relationship before using a different branch or commit.

## Implementation summary

- **Implemented:** dated journal days and multi-page journals; sketchbooks; favourites; My Story; text, photos, links, shapes, drawing grids, recordings and playback; versioned local snapshots and operation replay; native protected-file persistence; PencilKit drawing; Apple transcription services and explicit-request handlers; iCloud/CloudKit backup, recovery points and restore.
- **Partial:** the saved-recording **Convert to text** action is not rendered.
  Backup handles a competing iPad by refusing to overwrite and asking the user
  what to do, but no complete multi-device merge/conflict policy is approved.
  Recovery rejects required missing assets, while optional previews may be
  omitted.
- **Manual gate:** Pencil/finger behavior, microphone routing and interruptions, VoiceOver, Switch Control, iCloud account flows, two-iPad behavior, first-generation iPad Pro compatibility and release performance require the [physical iPad acceptance plan](../Specs/physical-ipad-acceptance.md). These gates have **not** been reported as passed here.
- **Proposed:** synchronized drawing replay, broader search/AI features and an iPhone experience.
- **Unresolved:** conflict merging and winner selection across devices. Code currently detects a different-device backup and avoids a silent overwrite; that safeguard is not a general policy.

The Xcode app target currently sets `TARGETED_DEVICE_FAMILY = 2` (iPad only). The product specification describes iPhone as future intent; it is not a currently supported target.

## Important gaps and exceptions

- `ios/App/App/JournalAudioPlugins.swift` contains app-target CloudKit backup/recovery implementation. Tests in `packages/ApplePlatformServices` do not execute that code; TypeScript tests cover contracts and pure restore/helper behavior only.
- `ios/App/App/AppDelegate.swift`, `ios/App/App/JournalAudioPlugins.swift`, `src/App.tsx`, `src/components/JournalPage.tsx`, and `src/domain/operations.ts` span broad responsibilities. See [boundaries](architecture/boundaries.md); do not mistake the target boundaries for completed modularisation.
- `JournalPage.transcribeVoice` and `MyStoryWorkspace.transcribeVoice` implement
  saved-recording transcription handlers, but `AudioCard.tsx` does not render
  the supplied `onConvertToText` action. Focused tests explicitly expect
  playback-only cards. The intended **Convert to text** interaction is
  therefore a current UI implementation gap, not merely a test-coverage gap.

## Verification

Run from the repository root:

```sh
npm ci
npm run validate
swift test --package-path packages/ApplePlatformServices
npm run cap:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
git diff --check
```

The simulator build is conditional on an available compatible Xcode installation. It does not replace physical-device gates.

## Navigation and authority

- [Product specification](../Specs/ivans-journal-spec.md)
- [Architecture index](architecture/INDEX.md)
- [ADR index](adr/README.md)
- [Feature status](FEATURE_STATUS.md)
- [Test matrix](TEST_MATRIX.md)
- [Active plans](plans/README.md)
- [CI workflow](../.github/workflows/ci.yml)
- [Physical iPad acceptance](../Specs/physical-ipad-acceptance.md)

Update this document whenever the canonical development branch changes or a feature changes maturity.
