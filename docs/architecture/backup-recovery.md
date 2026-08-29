# Backup and recovery

## Current implementation

The local `JournalSnapshot`, native media files and editable PencilKit files remain authoritative while working. `useBackupSync` computes a content token/fingerprint, flushes native drawing, creates safety/history entries, and calls the typed `CloudBackupPlugin`. The app-target implementation in `ios/App/App/JournalAudioPlugins.swift` stores snapshot and asset records in private CloudKit/iCloud storage.

Cloud content includes snapshot metadata plus original audio, photos and drawing assets enumerated as `CloudBackupAsset`. Derived previews need not be authoritative. Backup status is distinct from local `SaveHealth`; remote failure must not turn a durable local edit into an unsaved edit.

Recovery supports:

- latest-cloud restore;
- dated recovery-point listing/creation/restoration/deletion;
- a `before-restore` local safety point;
- migration and asset-URI reconciliation through `reconcileCloudRestore`;
- rejection before local replacement when required restored assets are missing;
- explicit double confirmation before deleting latest cloud data and history.

## Conflict semantics

Current code compares cloud/current device identifiers and content fingerprints. If iCloud contains a different diary, `useBackupSync` reports that nothing was overwritten and Settings offers explicit choices such as keeping this iPad, saving it as a recovery point, or restoring. `SettingsView.test.tsx` verifies the UI does not choose between two iPads without the user.

This is a safeguard, **not a complete conflict policy**. Merge rules, automatic winner selection, concurrent operation reconciliation, retention after resolution and two-device guarantees remain unresolved. Do not describe last-writer-wins or any other policy as accepted; see proposed/unresolved [ADR 0007](../adr/0007-multi-device-conflict-policy.md).

## Coverage gap and manual gates

`backupSyncHelpers.test.ts` covers fingerprints, status mapping, deletion confirmation and history list behavior. `cloudRestore.test.ts` covers pure reconciliation. These tests and Swift package tests do **not** execute the CloudKit implementation inside `JournalAudioPlugins.swift`; this app-target CloudKit gap is explicit.

iCloud account status, quota/network failures, Wi-Fi-only resumption, complete asset round trips, corrupt records and two-iPad behavior require [physical acceptance](../../Specs/physical-ipad-acceptance.md). No physical gate is claimed passed.
