# Architecture

At checkpoint `fe5c9e171cd34e384f304000e99351b098e73ed7`, Ivan's Diary is an iPad-only React/TypeScript application in a Capacitor shell. React owns product interaction and orchestration; domain operations create versioned journal snapshots; repositories commit local state; typed native adapters cross into Swift; PencilKit, audio, speech, protected files, sharing and CloudKit/iCloud are native services.

```text
Components -> hooks/orchestration -> domain operations
                    |                    |
                    v                    v
             repositories         JournalSnapshot
                    |
Native TS contracts/adapters -> Capacitor plugins -> Swift package/app target
```

## Route changes

- Product rules or operation semantics: [invariants](invariants.md), [data lifecycle](data-lifecycle.md), then `src/domain`.
- Local save, migration or replay: [data lifecycle](data-lifecycle.md), then `src/repository`.
- React/native interface: [boundaries](boundaries.md), then `src/native`.
- Pencil, drawing or preview behavior: [drawing](drawing.md).
- Recording, playback or speech: [audio and transcription](audio-transcription.md).
- CloudKit, recovery, history or conflict handling: [backup and recovery](backup-recovery.md).
- UI interaction or assistive access: [accessibility](accessibility.md).
- Feature maturity and proof: [feature status](../FEATURE_STATUS.md) and [test matrix](../TEST_MATRIX.md).
- Accepted or unresolved decisions: [ADR index](../adr/README.md).

## Target state

Keep testable platform behavior in Swift packages and the iOS app target focused on composition. This is direction, not present fact: `JournalAudioPlugins.swift` and `AppDelegate.swift` are known exceptions. The supported target is currently iPad; iPhone remains future product intent.
