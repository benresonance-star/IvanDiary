# Component guidance

These rules add to the repository root guidance for `src/components/`.

## Responsibilities

- Own presentation, interaction, view-local state, and accessible user
  feedback.
- Preserve touch, keyboard, VoiceOver semantics, clear accessible names, and
  reduced-motion behavior where applicable.
- Invoke orchestration or typed capabilities through explicit props and
  contracts.

## Permitted dependencies

- React, presentation utilities, and platform-neutral domain types.
- Hooks or typed adapters supplied by orchestration boundaries.
- Component-local helpers that do not own persistence or native policy.

## Forbidden responsibilities

- Direct durable-storage, migration, CloudKit, or conflict-resolution policy.
- Direct Swift/platform implementation concerns.
- Making transcripts or rendered drawing previews silently canonical.
- Pencil-only interactions that exclude finger or assistive use.

## Required tests

- Run the nearest component test for changed behavior.
- Run `accessibility.test.tsx` when shared interaction or semantics change.
- Run `npm run typecheck`; use `npm run validate` for broad UI changes.
- Report physical Pencil, microphone, VoiceOver, and first-generation iPad
  checks as not run unless performed on the required hardware.

## Common failure modes

- Moving persistence or native fallback decisions into event handlers.
- Breaking focus, labels, touch targets, keyboard operation, or reduced motion.
- Presenting asynchronous cloud work as locally saved durability.
- Overloading a component with orchestration that cannot be tested in isolation.

## Current exceptions

`JournalPage.tsx` currently combines substantial presentation, interaction, and
orchestration responsibilities. Do not describe it as already decomposed or
refactor it incidentally. Its characterization and feature-component seams are
future work in `docs/plans/active/modularisation.md`.
