# ADR 0007: Multi-device conflict policy

## Status

Unresolved

## Date

2026-08-25

## Context

CloudKit backup code can detect that a remote snapshot changed on another iPad, and product documentation requires conflicts not to be resolved silently. The release plan describes whole-app latest-state behavior and says concurrent editing is unsupported pending approval. Current code and tests do not prove a complete, intentional policy for concurrent edits, merge granularity, user choices, deletion conflicts, or recovery across multiple devices.

## Decision

No multi-device conflict-resolution policy is adopted by this ADR. Until an explicit policy is separately approved and tested, conflicts must not be silently resolved or documented as though merge, latest-writer, or device-precedence behavior were intentional. Existing detection and rejection behavior is implementation evidence, not a complete product policy.

## Alternatives or prior direction

- Latest-writer-wins, operation-level merge, whole-document choice, device precedence, and automatic duplication are possible approaches, but none is selected.
- The product specification's general promise to report conflicts explicitly is retained as an invariant, not treated as a complete resolution algorithm.
- The release plan's current limitations are prior operational direction, not an approved durable conflict policy.

## Consequences

- Multi-device editing remains a known product and release gap.
- Documentation and UI must not promise automatic reconciliation.
- Any policy decision will require conflict scenarios, deletion/history semantics, migration implications, user-facing behavior, rollback, and automated plus two-device acceptance tests.
- CloudKit behavior must not be changed opportunistically while this ADR remains unresolved.

## Evidence

- `ios/App/App/JournalAudioPlugins.swift::backupSnapshot` detects and rejects a snapshot changed on another iPad.
- `APP_RELEASE_TEST_PLAN.txt` includes multi-device and conflict-related manual cases.
- The approved Phase 0 report found no complete approved merge policy and marked confidence partial.
- No direct Swift package test exercises the app-target CloudKit implementation.

## Superseded documents

- None. Existing product and release documents provide requirements and partial direction, but no complete policy is being replaced.
