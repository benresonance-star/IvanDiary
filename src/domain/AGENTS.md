# Domain guidance

These rules add to the repository root guidance for `src/domain/`.

## Responsibilities

- Own product types, invariants, deterministic operations, migrations, and
  initial-state construction.
- Preserve operation ordering, replay, versioning, recovery, and migration
  semantics.

## Permitted dependencies

- TypeScript standard-library facilities and other pure domain modules.
- Data received through explicit, platform-neutral inputs.

## Forbidden responsibilities

- React rendering or component state.
- Browser storage, IndexedDB, Capacitor calls, Swift, CloudKit, or other
  platform transport.
- UI wording, visual policy, or implicit network and clock behavior.

## Required tests

- Run the nearest domain test, such as `operations.test.ts`,
  `migrations.test.ts`, `cloudRestore.test.ts`, or
  `storyRenderOrder.test.ts`.
- Run `npm run typecheck`; use `npm run validate` for broad changes.
- Characterize existing operation and migration behavior before refactoring.

## Common failure modes

- Changing replay results, operation ordering, IDs, or revision increments.
- Treating a derived preview, transcript, or cloud copy as canonical data.
- Making migrations non-deterministic or dropping recoverable history.
- Importing environment-specific behavior into otherwise pure operations.

## Current exceptions

`operations.ts` currently combines many operation families and is substantially
larger than the intended focused domain seams. Do not split it opportunistically
or imply that it is already modular. The characterization and extraction work
belongs in `docs/plans/active/modularisation.md`.
