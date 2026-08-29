# ADR 0004: CloudKit/iCloud backup and recovery

## Status

Accepted

## Date

2026-08-25

## Context

The checked-in iOS implementation uses the user's private iCloud database through CloudKit for snapshot, asset, history, and recovery records. Product documentation still names Supabase, PostgreSQL, object storage, authentication, and background Supabase synchronization as the backend direction. That wording does not describe the current implementation.

## Decision

CloudKit/private iCloud is the current backup and recovery implementation direction. It remains downstream of the local durability boundary in ADR 0003. Documentation must distinguish implemented code from guarantees that still require direct tests or physical iCloud acceptance.

## Alternatives or prior direction

- Supabase was the former documented backend direction in `Specs/ivans-journal-spec.md` and the deferred remote direction in `Specs/next-stage-plan.md`; it is superseded.
- A new cloud provider or dual-backend design is not part of this decision.
- Cloud-only authority was rejected by ADR 0003.

## Consequences

- New documentation must not present Supabase as the active backend.
- CloudKit record types, retention, restore, and deletion behavior are durable contracts and require separate approval before runtime changes.
- Swift package tests do not directly exercise the substantial app-target CloudKit implementation in `JournalAudioPlugins.swift`.
- Simulator compilation and current automated tests do not establish two-device, account, retention, or recovery guarantees.

## Evidence

- `ios/App/App/JournalAudioPlugins.swift` imports CloudKit and implements snapshot, asset, history, restore, retention, and deletion behavior, including records such as `IvanDiarySnapshot`, `IvanDiaryAsset`, `IvanDiaryHistory`, `IvanDiaryHistoryBlob`, and `IvanDiaryHistoryIndex`.
- `src/components/BackupSettingsPanel.tsx` describes private CloudKit storage.
- `APP_RELEASE_TEST_PLAN.txt` contains CloudKit-specific manual acceptance cases.
- The approved Phase 0 report identifies app-target CloudKit behavior as a direct-test coverage gap.

## Superseded documents

- `Specs/ivans-journal-spec.md` sections that prescribe Supabase authentication, PostgreSQL, object storage, and Supabase synchronization as the active backend.
- `Specs/next-stage-plan.md` statements that defer Supabase as the next remote integration.
