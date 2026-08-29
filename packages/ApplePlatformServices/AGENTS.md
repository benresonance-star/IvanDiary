# Apple platform services guidance

These rules add to the repository root guidance for
`packages/ApplePlatformServices/`.

## Responsibilities

- Own testable Swift services and Apple-platform abstractions for audio,
  files, speech/text editing, and PencilKit drawing.
- Preserve editable `.pkdrawing` data as the drawing authority and previews as
  derivatives.
- Keep service behavior testable independently of Capacitor composition.

## Permitted dependencies

- Apple SDK frameworks appropriate to the package targets.
- Internal package modules and explicit service abstractions.
- Foundation data types at package boundaries.

## Forbidden responsibilities

- React/UI product policy or TypeScript application orchestration.
- Capacitor plugin registration and app lifecycle composition.
- Claims that package tests exercise app-target CloudKit implementation.
- Signing, entitlements, or Xcode project changes without high-risk approval.

## Required tests

- Run `swift test --package-path packages/ApplePlatformServices`.
- Run relevant web/native contract tests and `npm run typecheck` if a shared
  bridge contract changes.
- Build the iOS app composition when package integration changes; report
  physical-device checks separately.

## Common failure modes

- Losing editable drawing data while retaining only a rendered preview.
- Breaking recording finalization, interruption recovery, or file durability.
- Assuming simulator/package success proves microphone, Pencil, or iCloud use.
- Coupling a service implementation to Capacitor call payloads.

## Current exceptions

The package contains testable audio and drawing services, but CloudKit
backup/recovery remains implemented in
`ios/App/App/JournalAudioPlugins.swift`; package tests do not directly cover it.
Moving that behavior behind a testable service boundary is known debt in
`docs/plans/active/modularisation.md`.
