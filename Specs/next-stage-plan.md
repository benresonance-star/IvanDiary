# Native reliability: next-stage plan (Historical)

> **Historical document.** This plan captured the proposed native-reliability
> sequence before those stages were implemented. It was assessed at the
> approved Phase 0 checkpoint, commit
> `fe5c9e171cd34e384f304000e99351b098e73ed7` (2026-08-24). Its Supabase and
> SQLite statements record prior proposals and are not current architecture.
> For current authority, see [Current state](../docs/CURRENT_STATE.md),
> [Feature status](../docs/FEATURE_STATUS.md), and
> [active plans](../docs/plans/README.md).

## Verified baseline and remaining risk

The browser build already provides the journal, page, sketchbook, accessibility,
composition, and clearly labelled audio/transcription simulation flows. Its
development repository transactionally commits IndexedDB snapshots and an
operation log, with replay, idempotency, migration, and recovery coverage. The
local `AppleDrawingKit` Swift package is linked to the App target. With Xcode
26.2, the App and package compile successfully as an unsigned Debug build for
an iPad simulator.

That evidence proves browser behavior and simulator compilation only. It does
not prove Pencil or palm handling, microphone capture, interruption recovery,
force-close durability, or any other physical-device behavior. Reliable local
iOS storage and recovery remain the critical MVP risk. Supabase is deferred
until local persistence and interruption recovery pass on physical hardware.

## Implementation sequence and exit criteria

1. **Compose native services (first PR).** Define one app-local composition root
   for injectable audio, file, transcription, metadata, lifecycle, and clock
   services; connect it to narrow, versioned Capacitor contracts without
   replacing the Windows browser simulations. **Exit:** contract and composition
   tests prove iOS selects native services, browser builds select simulations,
   dependencies can be replaced in tests, and an unsigned iPad simulator build
   succeeds.
2. **Record durable audio with AVFoundation.** Stream each recording to an
   app-controlled temporary file under a stable recording ID; expose explicit
   recording, paused/interrupted, stopped, and failed states. **Exit:** Swift
   tests cover lifecycle and interruption state transitions, and a physical
   iPad records playable audio through interruption and resume without losing
   the original file.
3. **Finalize native files atomically.** Flush and close recordings, atomically
   move them into their final Application Support location, and reconcile
   orphaned temporary/final files at launch. **Exit:** injected-failure tests at
   every finalization boundary recover to exactly one durable asset, and
   physical-iPad force-close/relaunch checks preserve every acknowledged
   recording.
4. **Add Apple Speech transcription.** Transcribe only from the preserved audio
   asset (or a shared live stream that never controls preservation), persist
   permission/error/progress state, and allow retry without changing the audio
   identity. **Exit:** denied, unavailable, partial, success, and retry paths are
   tested; a physical iPad produces a transcript while the original recording
   remains independently playable.
5. **Persist metadata and operations in SQLite.** Implement the existing
   repository contract with versioned schema migrations, idempotent operations,
   atomic snapshot/operation commits, and file-reference reconciliation. Keep
   IndexedDB as the Windows development repository. **Exit:** migration,
   replay, duplicate-operation, rollback, corruption-reporting, and relaunch
   tests pass, and physical-device restarts retain consistent pages, recordings,
   transcripts, and drawing references.
6. **Run the physical-device reliability gate.** Exercise the oldest supported
   iPad plus the primary iPad across Pencil/finger/palm behavior, microphone
   permissions, calls and audio-session interruptions, background/foreground,
   low-storage and denied-permission failures, repeated force-close/relaunch,
   accessibility, and long-session durability. **Exit:** the signed acceptance
   matrix has no data loss, unrecoverable state, or critical accessibility
   defect; simulator compilation remains a separate CI/build check.

## Focused PR breakdown

- PR 1: native-service protocols, composition root, Capacitor contract wiring,
  browser-simulation selection, and test doubles.
- PR 2: AVFoundation recorder and explicit lifecycle/interruption state machine.
- PR 3: atomic file finalization, launch reconciliation, and failure injection.
- PR 4: Apple Speech permissions, transcription, persistence hooks, and retry.
- PR 5: SQLite schema, migrations, repository adapter, operation log, and file
  reconciliation.
- PR 6: physical-device test harness, acceptance matrix, fixes, and evidence.

## Kickoff decisions

- Preserve the existing stable IDs across audio files, transcripts, metadata,
  and operations; acknowledge a save only after its durable boundary completes.
- Use Application Support for durable assets and SQLite; temporary recording
  paths are never referenced as committed assets.
- Keep native interfaces injectable and permission/lifecycle states explicit;
  do not make transcription or future network work a prerequisite for saving.
- Keep browser simulations visibly labelled and available for Windows work.
- Begin Supabase design or integration only after stages 2–6 demonstrate local
  persistence and interruption recovery on physical iPad hardware.
