# ADR 0001: Hybrid React/Capacitor iPad app

## Status

Accepted

## Date

2026-08-25

## Context

Ivan's Diary combines a React 19 and TypeScript interface with capabilities that require Apple frameworks. The web layer supplies product UI, domain operations, browser tests, and clearly labelled browser simulations. Capacitor 8 packages that interface for iOS and provides typed bridges to native Swift services. The current release target is iPad, not a web-only product.

## Decision

Keep the hybrid architecture: React/TypeScript owns the accessible interface and platform-independent product behavior; Capacitor contracts and adapters isolate transport; Swift and Apple frameworks own native recording, transcription, PencilKit, protected file storage, lifecycle integration, and CloudKit/iCloud behavior.

## Alternatives or prior direction

- A web-only app cannot provide or validate all required Pencil, audio, lifecycle, protected-storage, and iCloud behavior.
- A fully native rewrite would discard the implemented React interface and browser-based verification without evidence that the rewrite is necessary.
- The earlier plan to retain a web drawing surface unless a hardware gate failed has been superseded for production iPad drawing by the PencilKit decision in ADR 0002.

## Consequences

- Browser simulations remain development aids and must be visibly identified.
- Browser contracts stay independent of native implementations and injectable in tests.
- Changes crossing React, Capacitor, and Swift boundaries require verification at each affected layer.
- Simulator and browser success do not prove physical iPad behavior.

## Evidence

- `package.json` declares React, TypeScript, Vite, and Capacitor dependencies.
- `src/native/contracts.ts`, `src/native/composition.ts`, and `src/native/capacitorAdapters.ts` define and compose the native boundary.
- `ios/App/App/AppDelegate.swift` registers and composes iOS plugins.
- `packages/ApplePlatformServices/Package.swift` supplies testable Apple-platform services.

## Superseded documents

- The web-only production implication in `Specs/next-stage-plan.md` is historical where the corresponding native services are now implemented.
- The conditional native-drawing direction in `Specs/ivans-journal-spec.md` is superseded by ADR 0002 for production iPad drawing.
