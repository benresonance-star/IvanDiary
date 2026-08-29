# iOS app-target guidance

These rules add to the repository root guidance for `ios/App/App/`.

## Responsibilities

- Own Capacitor plugin exposure, dependency composition, application lifecycle,
  and entitlement-bound iOS integration.
- Adapt typed bridge calls to testable package services where those seams
  exist.

## Permitted dependencies

- Capacitor and iOS SDK frameworks.
- `ApplePlatformServices` package products and app-target composition helpers.
- Explicit bridge contracts mirrored by `src/native`.

## Forbidden responsibilities

- New testable journal domain or product policy in the app target.
- Silent changes to CloudKit records, conflict behavior, retention, deletion,
  history, or bridge APIs.
- Manual edits to `ios/App/App.xcodeproj/project.pbxproj`.
- Signing, capabilities, entitlement, or deployment-target changes without
  high-risk approval.

## Required tests

- Run matching TypeScript native contract/adapter tests and
  `swift test --package-path packages/ApplePlatformServices`.
- Build with:
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Run `npm run cap:sync` only when synchronization is required and authorized.
- Report microphone, Pencil, iCloud account, two-device, VoiceOver, performance,
  and first-generation iPad Pro gates as not run unless physically performed.

## Common failure modes

- TypeScript/Swift method-name or payload drift.
- Presenting CloudKit completion as the local save boundary.
- Silent conflict resolution or destructive history/asset cleanup.
- Adding service logic that cannot be exercised outside the app target.
- Treating simulator builds or package tests as CloudKit integration proof.

## Current exceptions

The app target is not currently thin. `JournalAudioPlugins.swift` contains
substantial plugin and CloudKit backup/recovery implementation, and
`AppDelegate.swift` contains broader composition responsibilities than the
target boundary intends. There is no direct Swift package-test coverage for the
app-target CloudKit code. Do not hide or expand these exceptions; stage their
characterization and extraction through
`docs/plans/active/modularisation.md`.
