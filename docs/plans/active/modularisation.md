# Behavior-preserving modularisation

**Status:** Draft; future work only
**Owner:** Maintainer to assign
**Created:** 2026-08-25
**Verified baseline:** `codex/durable-native-audio` at `fe5c9e171cd34e384f304000e99351b098e73ed7`; evidence in [current state](../../CURRENT_STATE.md), [boundaries](../../architecture/boundaries.md), and [test matrix](../../TEST_MATRIX.md)
**Risk tier:** Medium by default; CloudKit/native API, persistence, or Xcode changes are high risk

No refactor is authorized or implemented by this plan. Each candidate below is a separate increment and must use one change per PR. Do not combine seams merely because files are adjacent.

## Problem and user outcome

Several large files span responsibilities, making small changes harder to review and increasing the chance of unintended persistence, native, interaction, or rendering changes. The outcome is narrower, testable boundaries that preserve Ivan's data, explicit transcription, editable drawings, accessibility, and current UI behavior.

## Baseline and evidence

- `ios/App/App/JournalAudioPlugins.swift` contains app-target CloudKit backup/recovery behavior with no direct Swift behavior tests.
- `ios/App/App/AppDelegate.swift` combines composition and lifecycle work.
- `src/components/JournalPage.tsx`, `src/domain/operations.ts`, `src/App.tsx`, and `src/styles.css` span broad responsibilities.
- The current automated baseline is recorded in the [test matrix](../../TEST_MATRIX.md). Physical acceptance remains unperformed.
- Assumption: useful seams can be introduced without changing durable contracts. Verify this independently for every PR.

## Scope

**In scope:** future characterization tests, dependency-preserving extraction, narrower modules, stable contracts, and documentation updates.

**Out of scope:** behavior changes; persistence/schema/migration changes; CloudKit record changes; conflict-policy selection; native bridge API changes; Xcode capability/signing changes; dependency changes; redesign; CSS visual changes; and claiming physical acceptance.

## Boundaries and invariants

Affected boundaries are iOS app composition, Swift package services, native TypeScript adapters, domain operations, React orchestration/components, and styling. Every increment must preserve all [product invariants](../../architecture/invariants.md), especially local durability before cloud, no silent conflict resolution, original audio and editable PencilKit authority, accessibility, and the supported iPad baseline.

## Alternatives considered

- **Leave files intact:** lowest immediate change risk, but preserves the CloudKit test gap and broad review surfaces.
- **One large reorganization:** faster structural convergence but an unacceptable regression and review surface.
- **Incremental characterization-first extraction (recommended):** slower, but gives each seam an observable behavior baseline, focused rollback, and one-PR review boundary.

## Ordered candidates

The order is mandatory because later seams should build on evidence and boundaries established earlier.

### 1. Extract testable CloudKit backup/recovery behavior

- **Prerequisite characterization tests:** capture snapshot/asset planning, completeness checks, history retention and same-day safety behavior, record-name/index mapping, missing/corrupt asset handling, deletion scope, and conflict refusal. Preserve current app-target behavior before moving it.
- **Intended seam:** a protocol-backed service in `packages/ApplePlatformServices` (or another explicitly approved testable Swift package boundary), leaving Capacitor registration and entitlement-bound CloudKit composition in `JournalAudioPlugins.swift`.
- **Risk:** high. Record behavior, retention, deletion, error mapping, threading, or native bridge contracts could change; package extraction may incorrectly imply CloudKit itself is tested.
- **Acceptance gate:** new service tests pass; existing 32 Swift tests and web validation pass; unsigned simulator build passes; bridge payloads and CloudKit schema are unchanged; T-14–T-46 remain explicitly manual until run.
- **PR rule:** one PR for characterization tests, then one PR for one service extraction. Do not combine with AppDelegate cleanup.

### 2. Reduce `AppDelegate.swift` to composition and lifecycle

- **Prerequisite characterization tests:** establish plugin registration order, launch/background/foreground callbacks, interruption forwarding, protected-data behavior, and any recovery initialization observable at the boundary.
- **Intended seam:** small composition objects or package-backed coordinators called by a thin app delegate; lifecycle ownership remains explicit.
- **Risk:** medium to high. Startup ordering and iOS lifecycle regressions may only appear on device; project-file or capability edits are not implied.
- **Acceptance gate:** characterization and package tests pass; plugin registration and public bridge contracts are identical; simulator build passes; background/foreground and interruption physical checks remain required.
- **PR rule:** extract one responsibility per PR after tests; do not edit `project.pbxproj` manually.

### 3. Split `JournalPage.tsx` into feature components and orchestration

- **Prerequisite characterization tests:** page create/select/reorder/delete, text add/edit/cancel/fallback, recording/share exclusion, favourites, drawing-overlay ownership, layering, focus restoration, accessible names, and operation dispatch shape.
- **Intended seam:** a page orchestration container with stable feature contracts for header/navigation, object rendering/editing, drawing, audio, sharing, and dialogs. Components receive callbacks and state, not repository/native policy.
- **Risk:** medium. Focus, stacking, stale closures, operation ordering, recording state, and touch/keyboard behavior can regress despite identical appearance.
- **Acceptance gate:** focused component tests and full web validation pass; no durable operation or native contract changes; visual and accessibility review passes; device drawing/audio gates remain manual.
- **PR rule:** one feature extraction per PR, beginning with the lowest-state/lowest-native-coupling feature.

### 4. Split `src/domain/operations.ts` by aggregate or operation family

- **Prerequisite characterization tests:** operation replay/idempotency, stale-state rejection, page/sketchbook/story atomicity and limits, favourites, object movement/resizing, grids, and migration compatibility. Record operation serialization fixtures if not already stable.
- **Intended seam:** modules by aggregate or operation family behind the existing dispatcher/export surface; operation names, payloads, validation, ordering, and semantics remain unchanged.
- **Risk:** medium, becoming high if persisted operation formats or replay behavior change. Circular dependencies and altered dispatch precedence are primary hazards.
- **Acceptance gate:** all existing domain/repository/migration tests pass; replay of current fixtures is byte/semantically equivalent as applicable; public TypeScript and durable data contracts do not change.
- **PR rule:** one operation family per PR. Any schema or persisted-operation proposal requires a separate high-risk plan.

### 5. Reduce `src/App.tsx` orchestration breadth

- **Prerequisite characterization tests:** startup/repository selection, active area and profile state, backup/recovery dialog flow, settings handoff, error boundary behavior, and service composition.
- **Intended seam:** focused orchestration hooks/containers around existing domain, repository, native-service, and navigation contracts; `App.tsx` remains the composition root.
- **Risk:** medium. Initialization order, duplicated subscriptions, stale state, recovery prompts, and cross-area navigation can change.
- **Acceptance gate:** composition, accessibility, settings, recovery, and integration-style component tests pass with full web validation; no persistence or native policy moves into presentation code.
- **PR rule:** one orchestration responsibility per PR after characterization coverage is accepted.

### 6. Split `src/styles.css` by feature or layer

- **Prerequisite characterization tests:** establish representative screenshot or computed-style baselines for navigation, Journal, drawing tools, dialogs, Settings, My Story, responsive layouts, focus, reduced motion, high contrast, and large text. Choose tooling without adding a production dependency.
- **Intended seam:** ordered foundation/layout/component/feature/accessibility layers, preserving cascade order, specificity, custom properties, media queries, and rendered output.
- **Risk:** medium. Import order and specificity changes can cause broad visual, hit-target, focus, and accessibility regressions.
- **Acceptance gate:** production build and web validation pass; approved visual comparisons show no unintended differences at supported layouts/preferences; physical large-text, contrast, rotation, and touch-target checks remain manual.
- **PR rule:** move one coherent layer or feature section per PR with no selector redesign or visual cleanup.

## Test plan and manual gates

For every candidate:

1. Run and review prerequisite characterization tests before extraction.
2. Run the nearest focused suite, `npm run typecheck`, and relevant Swift package tests.
3. Run `npm run validate`; for native work also run `swift test --package-path packages/ApplePlatformServices`, `npm run cap:sync`, and the CI-equivalent unsigned simulator build.
4. Compare public TypeScript/Swift APIs and durable payloads before and after.
5. Link applicable IDs from `Specs/physical-ipad-acceptance.md` and `APP_RELEASE_TEST_PLAN.txt`; report them as not run unless performed on specified hardware.

## Risks and rollback

The principal risk is a structural diff concealing behavior, storage, bridge, or cascade changes. Keep the pre-extraction characterization commit reviewable, avoid mixed cleanup, and rollback the single candidate PR if its acceptance gate fails. Never repair a refactor regression by weakening a test or changing product policy in the same PR.

## Approval points

- [ ] Maintainer approves the baseline, candidate order, and one-change-per-PR rule.
- [ ] Characterization test scope is approved before each extraction.
- [ ] Candidate 1 receives explicit high-risk approval for its CloudKit/service/API boundary.
- [ ] Any persistence, schema, native bridge, conflict, retention, deletion, Xcode, or dependency decision receives separate explicit approval.
- [ ] The acceptance gate and physical-test owner are approved for each PR.
- [ ] Completion record and remaining gaps are accepted before moving this plan to `completed/`.

## Completion record

- **Final PRs/commits:** Not started.
- **Changes delivered:** None.
- **Verification:** Planning evidence only.
- **Manual gates:** Not run.
- **Deviations:** None.
- **Remaining risks/follow-ups:** All six candidates.
- **Completion decision/date:** Pending.
