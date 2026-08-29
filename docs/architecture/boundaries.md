# Boundaries

## Current implementation

| Layer | Current ownership | Known exceptions |
|---|---|---|
| `src/domain` | Models, migrations, deterministic operations, restore reconciliation | `operations.ts` is broad; split only under an approved behavior-preserving plan. |
| `src/repository` | Browser/native persistence and local durability | Native storage transport is reached through typed contracts. |
| `src/native` | Capacitor contracts, adapters, capability detection and browser/test substitutes | Must not decide journal product policy. |
| Hooks and `src/App.tsx` | Coordinate repository, backup, drawing and UI state | `App.tsx` and `useBackupSync.ts` carry substantial orchestration. |
| `src/components` | Presentation, interactions and accessibility | `JournalPage.tsx` and `MyStoryWorkspace.tsx` also coordinate feature flows. |
| `packages/ApplePlatformServices` | Testable PencilKit, audio, speech and file services | Package tests prove package code only. |
| `ios/App/App` | Capacitor registration, lifecycle and entitlement-bound integration | `JournalAudioPlugins.swift` contains substantial CloudKit/backup implementation; `AppDelegate.swift` has broad composition work. |

Dependencies should flow from UI/orchestration toward domain, repository and typed native contracts. Domain code must not import React, Capacitor, browser persistence or Swift concepts. Components must not directly implement durable-storage or CloudKit policy.

The app-target CloudKit exception matters: `CloudBackupPlugin` is typed in `src/native/contracts.ts`, orchestrated by `useBackupSync`, but its real CloudKit behavior remains in `ios/App/App/JournalAudioPlugins.swift`. `packages/ApplePlatformServices` tests do not exercise it.

## Cross-boundary rules

- Stored schema, operations, migrations, CloudKit record behavior and native bridge APIs require explicit approval.
- Local durability precedes any “saved” presentation; remote backup is separate.
- Conflict behavior cannot be inferred. Current different-device detection avoids overwrite but is not a merge policy.
- Browser mocks are capability substitutes, not evidence that native hardware behavior works.

## Target state

Move independently testable CloudKit behavior behind a package/service boundary, reduce `AppDelegate.swift` to lifecycle/composition, and split broad React/domain files around stable contracts. See the [active modularisation plan](../plans/active/modularisation.md). No target-state statement claims that refactoring has happened.
