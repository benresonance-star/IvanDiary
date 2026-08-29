# IvanDiary repository guidance

## Product and authority

Ivan's Diary is an accessible iPad journal with durable local data, editable
PencilKit drawing, native recording and user-triggered transcription, and
iCloud/CloudKit backup and recovery. Browser audio and transcription are
simulations; production integrations are behind typed Capacitor and Swift
boundaries.

Before editing, read `docs/CURRENT_STATE.md`, the relevant page under
`docs/architecture/`, relevant accepted decisions under `docs/adr/`, and the
nearest scoped `AGENTS.md`. If a phased documentation change has not created
one of those sources yet, report that limitation and use the approved evidence
report; do not invent its contents.

Authority by question is defined in
[`Specs/agent-readiness-implementation-spec.md`](Specs/agent-readiness-implementation-spec.md#6-source-of-truth-hierarchy).
Actual behavior is established by code and passing tests at the checkpoint.
When sources conflict, report the evidence and unresolved decision rather than
choosing product policy.

## Planning and invariants

Non-trivial work starts with a reviewable evidence report and an approved plan.
Preserve the product invariants in `docs/architecture/invariants.md`, especially
original audio, editable PencilKit data, local durability before cloud backup,
explicit transcription, recoverability, accessibility, and explicit conflict
handling.

Risk and approval rules follow
[`Specs/agent-readiness-implementation-spec.md`](Specs/agent-readiness-implementation-spec.md#11-risk-tiers-and-approval):

- Low-risk documentation and scoped-rule changes require a reviewed plan.
- Medium-risk tests or behavior-preserving refactors require a separate plan,
  affected invariants, characterization tests, and explicit approval.
- High-risk persistence, migration, CloudKit, conflict, native API, Xcode,
  deletion/history, or dependency changes require evidence, options, rollback,
  and explicit approval before editing.
- Physical release gates cannot be inferred from unit tests or a simulator.

## Change discipline

- Make the smallest coherent diff; do not perform opportunistic refactors.
- Do not weaken tests or alter durable formats, migrations, or replay/recovery
  semantics to simplify a change.
- Preserve accessible touch, keyboard, VoiceOver, and reduced-motion behavior.
- Keep browser-facing contracts independent from platform implementations.
- Preserve unrelated working-tree changes; never discard or overwrite them.
- Ask before adding a production dependency or changing a durable data contract.
- Do not edit `ios/App/App.xcodeproj/project.pbxproj` manually.
- Track known boundary debt in `docs/plans/active/modularisation.md`.

## Verification

- Focused web change: nearest relevant test plus `npm run typecheck`.
- Full web validation: `npm run validate`.
- Swift package change:
  `swift test --package-path packages/ApplePlatformServices`.
- Web/native synchronization when required: `npm run cap:sync`.
- iOS composition when required:
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.

Report physical microphone, Pencil, iCloud, two-device, VoiceOver, performance,
and first-generation iPad Pro/iPadOS 15 gates as not run unless performed on
the specified hardware.

## Final handoff

State files changed, decisions made, tests run and results, tests or physical
gates not run and why, remaining risks, and follow-ups.
