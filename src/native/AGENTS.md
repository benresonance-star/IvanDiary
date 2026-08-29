# Native TypeScript guidance

These rules add to the repository root guidance for `src/native/`.

## Responsibilities

- Own typed browser-facing contracts, capability detection, Capacitor adapters,
  error normalization, and explicit browser/test fallbacks.
- Keep platform transport separate from journal product policy.

## Permitted dependencies

- Platform-neutral domain types needed by contracts.
- Capacitor APIs inside adapters and browser APIs inside named browser mocks or
  fallbacks.
- Other native-boundary modules with explicit typed contracts.

## Forbidden responsibilities

- React presentation or component state.
- Durable journal schema, migration, retention, or conflict policy.
- Hidden fallbacks that claim native durability or capability not provided.
- Swift implementation details leaking into consumer-facing contracts.

## Required tests

- Run the affected tests, including `composition.test.ts`,
  `durableAudio.test.ts`, `ephemeralTranscription.test.ts`, and/or
  `textEditor.test.ts`.
- Run `npm run typecheck`; use `npm run validate` for broad contract or
  composition changes.
- Native bridge API changes are high risk and require explicit approval plus
  matching Swift and integration verification.

## Common failure modes

- Contract drift between TypeScript and Capacitor plugin method payloads.
- Treating browser simulations as proof of iOS behavior.
- Converting recordings implicitly or replacing original audio with text.
- Swallowing capability and permission failures behind silent behavior.

## Current exceptions

The boundary contains a broad set of capabilities in `contracts.ts`, while
production implementations span Swift package code and app-target plugins.
CloudKit behavior remains in the app target and is not proved by native
TypeScript tests. Track any contract decomposition or adapter extraction in
`docs/plans/active/modularisation.md`.
