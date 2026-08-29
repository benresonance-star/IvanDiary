# ADR 0003: Local durability before cloud backup

## Status

Accepted

## Date

2026-08-25

## Context

Ivan must be able to trust that acknowledged journal work survives network loss and cloud-service unavailability. Cloud backup is a second durability and recovery layer, not the boundary that makes an active edit safe. A React state update alone is also not durable storage.

## Decision

Complete the applicable local durable commit before presenting work as saved. Cloud backup, synchronization, or transcription must not be required for local save success. Report local-save state separately from remote backup state.

## Alternatives or prior direction

- Cloud-first persistence was rejected because connectivity and account state would control whether current work is safe.
- UI-state-only acknowledgement was rejected because memory state does not survive process termination.
- Earlier planning deferred Supabase until local reliability was proven; ADR 0004 replaces Supabase with CloudKit as the current remote direction while preserving this local-first boundary.

## Consequences

- Repository save APIs must resolve only after their local durability boundary completes.
- Local failure must remain visible and retryable; remote success cannot mask it.
- Cloud backup may lag or fail without invalidating an already durable local save.
- Physical force-close and interruption guarantees remain unproven until the specified hardware gates are performed.

## Evidence

- `src/repository/browserJournalRepository.ts` commits snapshots and operation logs transactionally in IndexedDB.
- `src/repository/nativeJournalRepository.ts` waits for the native commit contract.
- `src/repository/browserJournalRepository.test.ts` covers atomic commit and operation-log recovery.
- `src/repository/nativeJournalRepository.test.ts` covers native save failure and retry behavior.
- `Specs/physical-ipad-acceptance.md` defines force-close and local-durability checks.

## Superseded documents

- Any reading of `Specs/ivans-journal-spec.md` or `Specs/next-stage-plan.md` that makes Supabase synchronization the authority for whether the current local edit is safe.
- No document is superseded where it already requires local durability before remote backup.
