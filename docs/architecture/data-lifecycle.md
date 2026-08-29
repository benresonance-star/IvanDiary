# Data lifecycle

## Current implementation

1. **Create:** initial state and create operations in `src/domain/initialState.ts` and `src/domain/operations.ts` produce pages, sketchbooks, stories and stable IDs.
2. **Edit:** UI events become typed `DocumentOperation` inputs. `applyDocumentOperation` checks base revisions, applies deterministic changes and records operation IDs so replay is idempotent.
3. **Save:** `useJournal` commits through a repository. `NativeJournalRepository.commit` writes the serialized snapshot/operations through `NativeJournalStorePlugin`; only a successful write advances the in-memory baseline and `SaveHealth`.
4. **Native assets:** audio and photos use stable `AssetRef` values and app-controlled files. PencilKit stores editable drawing files by `drawingDocumentId`; previews are derivatives.
5. **Backup:** `useBackupSync` separately sends snapshot metadata and enumerated audio/photo/drawing assets through `CloudBackupPlugin`. A local save does not wait for CloudKit.
6. **Delete:** domain operations remove entities/references; associated native drawing/file cleanup is coordinated by orchestration. Native file deletion moves supported assets to recoverable trash, while explicit cloud-data deletion uses two warnings.
7. **History:** `createHistoryEntry` creates automatic, manual or `before-restore` recovery points. A safety point can coexist temporarily with the same-day restore target.
8. **Restore:** `CloudBackupPlugin.restore`/`restoreHistory` returns snapshot JSON and restored asset URIs. `reconcileCloudRestore` migrates data, rewrites asset locations and rejects a restore missing required assets before `repository.replace`.

## Failure behavior

- Stale operations are rejected; replaying an applied operation is idempotent (`operations.test.ts`).
- A failed native write does not advance in-memory state (`nativeJournalRepository.test.ts`).
- A failed or incomplete cloud restore leaves the local diary unchanged (`cloudRestore.test.ts` and `useBackupSync` error handling).
- Backup failure reports remote attention while the local diary remains saved.
- Drawing flush and asset enumeration precede backup where native PencilKit is available.

Recovery retention is limited to implemented CloudKit history and native trash behavior; indefinite history is not promised. Multi-device merge semantics are [unresolved](backup-recovery.md).
