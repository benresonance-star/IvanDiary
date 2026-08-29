# Repository guidance

These rules add to the repository root guidance for `src/repository/`.

## Responsibilities

- Own persistence interfaces, serialization, durable local journal and sketch
  storage, operation-log use, and repository-specific recovery behavior.
- Keep native and browser implementations compatible with domain contracts.

## Permitted dependencies

- `src/domain` types and deterministic operations.
- Browser storage APIs in browser repository implementations.
- Typed native storage contracts through `src/native` in native
  implementations.

## Forbidden responsibilities

- React rendering, component state, interaction design, or UI policy.
- Direct CloudKit product policy or unrelated platform capability handling.
- Silent stored-format, migration, retention, or conflict-policy changes.

## Required tests

- Run the affected repository tests:
  `browserJournalRepository.test.ts`, `nativeJournalRepository.test.ts`, and/or
  `browserSketchRepository.test.ts`.
- Run related domain migration/operation tests when durable representations or
  replay are involved, plus `npm run typecheck`.
- Use `npm run validate` for broad changes. Stored-format and migration changes
  are high risk and require explicit approval before editing.

## Common failure modes

- Reporting a save before local durable storage has completed.
- Diverging browser and native load/commit behavior.
- Losing operation-log recovery, revisions, assets, or migration compatibility.
- Putting view-state defaults or CloudKit conflict decisions in repositories.

## Current exceptions

Browser and native persistence implementations necessarily use different
transports, and `developmentDatabase.ts` is development-only infrastructure;
tests must not make either look like production parity without evidence.
Any future extraction or boundary cleanup must be recorded and staged in
`docs/plans/active/modularisation.md`.
