# ADR 0002: PencilKit data is the editable drawing authority

## Status

Accepted

## Date

2026-08-25

## Context

Journal drawings must remain editable and preserve the user's hand. The production iPad implementation uses PencilKit, while rendered images are useful for previews, sharing, and recovery presentation. A rendered preview cannot faithfully reconstruct editable strokes.

## Decision

The serialized `.pkdrawing` representation is the canonical, editable drawing authority. PNG or other rendered representations are derivatives only and must not replace PencilKit data as the source for subsequent editing.

## Alternatives or prior direction

- The product specification previously proposed a web vector drawing surface first, with PencilKit only if a hardware gate failed.
- Treating a rendered preview as authoritative was rejected because it loses editable stroke semantics.

## Consequences

- Saves, migrations, backup, restore, and recovery must preserve the editable PencilKit payload.
- Preview generation may fail or change without redefining the drawing's authoritative content.
- Pencil, finger, palm rejection, latency, and large-document behavior still require physical-iPad acceptance; implementation evidence alone does not pass those gates.
- Browser drawing remains a labelled development fallback, not production drawing authority.

## Evidence

- `src/native/pencilKit.ts` defines the TypeScript boundary for native drawing.
- `packages/ApplePlatformServices/Sources/AppleDrawingKit/NativeDrawingOverlay.swift` and `NativeDrawingViewController.swift` implement PencilKit editing.
- `packages/ApplePlatformServices/Sources/AppleDrawingKit/LegacyInkImport.swift` handles legacy drawing import.
- `Specs/physical-ipad-acceptance.md` contains the required physical drawing and durability checks.

## Superseded documents

- `Specs/ivans-journal-spec.md` direction that a web drawing surface is the initial production implementation and PencilKit is only a conditional fallback.
- `Specs/next-stage-plan.md` is historical where it presents native drawing integration as future work.
