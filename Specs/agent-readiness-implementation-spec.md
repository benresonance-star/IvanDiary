# Ivan’s Diary — Agent-Ready Repository Implementation Specification

**Version:** 1.0  
**Date:** 2026-08-24  
**Repository:** https://github.com/benresonance-star/IvanDiary  
**Verified development checkpoint:** Draft PR [#4](https://github.com/benresonance-star/IvanDiary/pull/4), commit `fe5c9e171cd34e384f304000e99351b098e73ed7`  
**Intended executor:** GPT Sol Light in Cursor  
**Intended repository path:** `Specs/agent-readiness-implementation-spec.md`  
**Status:** Ready for Phase 0 inspection; no implementation is authorized until the Phase 0 report is reviewed.

## 1. Executive instruction

Make Ivan’s Diary easy for a coding agent to understand and modify safely. First establish repository governance, current-state documentation, architectural boundaries, product invariants, and test traceability. Do not begin by refactoring production code.

The first implementation is a documentation-and-agent-rules change only. It must:

1. make the active development baseline unambiguous;
2. tell agents what sources are authoritative;
3. reconcile known contradictions in existing specifications;
4. map product invariants to implementation locations and tests;
5. require a reviewable plan before non-trivial edits;
6. record architectural debt without trying to solve it in the same change.

Do not merge PR #4, modify `main`, alter application behavior, change persistence formats, add dependencies, or claim physical-device validation as part of this implementation.

## 2. Why this work is necessary

The repository already contains meaningful architecture, typed contracts, product documentation, automated tests, CI, and a physical-iPad acceptance plan. The problem is discoverability and authority: a fresh agent cannot reliably tell which branch, document, implementation, and test describes the current product.

The verified audit found:

| Finding | Consequence for an agent |
|---|---|
| Default branch `main` is behind active draft PR #4 | An agent starting from the default branch can reason about obsolete code. |
| No root or scoped `AGENTS.md` files | Repository-specific operating constraints are not loaded persistently. |
| Product spec still mentions Supabase | It conflicts with the active CloudKit/iCloud implementation direction. |
| Product spec describes automatic transcription after stopping | It conflicts with the current explicit **Convert to text** interaction. |
| `Specs/next-stage-plan.md` describes implemented work as future work | Planning state is misleading. |
| Architecture is implicit across large files and tests | A small change can cross domain, repository, web/native, or Swift boundaries unintentionally. |
| The app-target CloudKit implementation is not directly covered by the Swift package tests | Green package tests do not prove CloudKit behavior. |
| Several files are very large | A light agent is more likely to make broad, poorly scoped changes without an explicit seam map. |

Large files observed at the verified checkpoint include:

| File | Approximate size | Treatment in this implementation |
|---|---:|---|
| `src/components/JournalPage.tsx` | 2,382 lines | Document responsibilities and future seams; do not refactor. |
| `ios/App/App/JournalAudioPlugins.swift` | 2,034 lines | Document native bridge and CloudKit test gap; do not refactor. |
| `src/App.tsx` | 1,314 lines | Document orchestration role; do not refactor. |
| `src/domain/operations.ts` | 1,229 lines | Document domain boundary; do not refactor. |
| `ios/App/App/AppDelegate.swift` | 767 lines | Document composition responsibilities; do not refactor. |
| `src/styles.css` | 5,948 lines | Record feature-section split as future debt; do not refactor. |

## 3. Outcomes

When this specification is complete, a fresh agent must be able to answer, with exact file and test references:

- What branch or commit represents the current implementation?
- What data is authoritative for a journal page, drawing, recording, transcript, and backup?
- Where may domain, repository, native adapter, UI, and Swift platform behavior live?
- Which tests protect each critical product invariant?
- Which behavior is implemented, only manually verified, proposed, or unresolved?
- Which decisions require human approval before code is changed?

## 4. Non-goals

This implementation must not:

- refactor the large production files listed above;
- change UI, persistence, sync, backup, recovery, transcription, audio, or drawing behavior;
- change public TypeScript or Swift APIs;
- change a database, CloudKit record type, stored payload, operation-log format, or migration;
- select or invent a multi-device conflict policy;
- add a cloud service or replace CloudKit/iCloud;
- add, remove, or upgrade dependencies;
- weaken, skip, delete, or rewrite tests to make verification pass;
- change Xcode project settings, signing, capabilities, deployment targets, or release configuration;
- claim a physical-iPad acceptance gate passed without performing it on the specified hardware;
- turn aspirational architecture into a false description of the present implementation.

## 5. Non-negotiable product invariants

Every repository rule, architecture page, ADR, plan, and test matrix must preserve these invariants. If the current code or documentation appears to contradict one, stop and report the conflict rather than normalizing it silently.

1. **Original recordings are preserved.** Audio is source material; a transcript is a derivative and must not replace it.
2. **Transcription is explicit in the current product.** The user requests **Convert to text**; stopping a recording does not silently make transcription the authoritative state.
3. **Editable PencilKit data is authoritative.** The `.pkdrawing` representation is canonical for editing; rendered previews are derivatives.
4. **A save is locally durable before it is presented as saved.** Cloud backup or sync must not be the only durability boundary.
5. **Conflicts must not be resolved silently.** Any conflict behavior must be explicit, documented, and tested or marked unresolved.
6. **Deletion and history are recoverable to the extent promised by the product.** Documentation must distinguish implemented retention from desired retention.
7. **AI-generated or transcribed material is not silently canonical.** The user retains control of journal content.
8. **Finger interaction and accessibility remain supported.** Pencil-first behavior must not exclude touch or assistive use.
9. **The supported hardware and OS baseline remains explicit.** The current release target includes first-generation iPad Pro constraints and iPadOS 15 compatibility unless a separately approved decision changes them.
10. **Documentation-only work must not alter runtime behavior.** If a documentation correction reveals a product decision, record it for approval instead of implementing it opportunistically.

## 6. Source-of-truth hierarchy

Create and use the following authority model:

| Question | Authoritative source |
|---|---|
| Current branch, commit, implemented features, known gaps | `docs/CURRENT_STATE.md` |
| User-facing product intent and interaction | `Specs/ivans-journal-spec.md` |
| Accepted technical decisions and their consequences | `docs/adr/*.md` |
| Current component and dependency boundaries | `docs/architecture/*.md` |
| Feature maturity | `docs/FEATURE_STATUS.md` |
| Invariant-to-test coverage | `docs/TEST_MATRIX.md` |
| Active implementation work | `docs/plans/active/*.md` |
| Historical intent | Documents explicitly labelled historical; never treated as current authority |
| Actual executable behavior | Code and passing tests at the pinned checkpoint |

If two authoritative sources disagree:

1. identify both sources and quote only the minimal conflicting propositions;
2. inspect the current implementation and tests;
3. state what is implemented and what remains a product decision;
4. do not choose a new product or architecture policy;
5. add the conflict to the Phase 0 report and wait for approval.

## 7. Change allowlist

For this implementation, changes are allowed only in:

- `AGENTS.md`
- `.cursor/rules/00-plan-first.mdc`
- `src/components/AGENTS.md`
- `src/domain/AGENTS.md`
- `src/repository/AGENTS.md`
- `src/native/AGENTS.md`
- `packages/ApplePlatformServices/AGENTS.md`
- `ios/App/App/AGENTS.md`
- `docs/**`
- `README.md`
- `Specs/ivans-journal-spec.md`
- `Specs/next-stage-plan.md`

Do not modify other files. In particular, do not modify application source beneath `src/**`, `ios/**`, or `packages/**` except for the scoped `AGENTS.md` files explicitly listed above. Do not modify lockfiles, package manifests, Xcode project files, CI, assets, fixtures, or snapshots.

If the repository’s actual structure makes an allowlisted path invalid, report the mismatch and propose the smallest corrected path in the Phase 0 report. Do not create speculative directories or rename existing code.

## 8. Required deliverables

### 8.1 Root `AGENTS.md`

Create a concise, tool-neutral operating manual. It must contain:

1. **Product summary:** Ivan’s Diary is an iPad journal with durable local data, editable drawing, native recording/transcription, and iCloud/CloudKit backup and recovery.
2. **Before editing:** read `docs/CURRENT_STATE.md`, the relevant architecture page, relevant ADRs, and the nearest scoped `AGENTS.md`.
3. **Plan-first rule:** non-trivial work begins with an evidence report and an approved plan.
4. **Authority hierarchy:** link to the sources in Section 6 instead of duplicating them.
5. **Critical invariants:** concise links to `docs/architecture/invariants.md`.
6. **Risk tiers and approval rules:** use Section 11.
7. **Verification:** list exact commands and the physical-device qualification.
8. **Change discipline:** smallest coherent diff; no opportunistic refactors; no test weakening; preserve user changes.
9. **Required final handoff:** files changed, decisions, tests run, tests not run, risks, and follow-ups.

Keep the root file short enough to remain useful in agent context. Prefer links to canonical documentation over copied prose.

### 8.2 Cursor rule

Create `.cursor/rules/00-plan-first.mdc` as a small always-applied bridge to the repository’s canonical instructions. Use this structure:

```md
---
description: Plan-first repository governance for Ivan's Diary
alwaysApply: true
---

- Read `AGENTS.md` and `docs/CURRENT_STATE.md` before editing.
- Read the nearest scoped `AGENTS.md` for every directory you change.
- For non-trivial work, use Plan Mode and produce the Phase 0 evidence report before modifying files.
- Do not infer product policy when specifications, code, and tests conflict. Stop and report the conflict.
- Preserve the invariants and verification requirements linked from `AGENTS.md`.
```

Do not copy the full root rules into the Cursor rule. Cursor supports project rules and root or nested `AGENTS.md`; the repository documents should remain the canonical content. See [Cursor Rules](https://cursor.com/docs/rules) and [Cursor Plan Mode](https://cursor.com/docs/agent/plan-mode).

### 8.3 Scoped `AGENTS.md` files

Each scoped file must state the directory’s responsibilities, permitted dependencies, forbidden responsibilities, required tests, and common failure modes. More specific rules add to or override root rules only for their subtree.

| File | Required boundary |
|---|---|
| `src/domain/AGENTS.md` | Pure domain types, invariants, and operations. No React, Capacitor, browser storage, or Swift/platform concerns. Preserve deterministic behavior and operation semantics. |
| `src/repository/AGENTS.md` | Persistence abstractions and durable local state. No UI policy. Changes to stored formats or migrations are high risk and require explicit approval. |
| `src/native/AGENTS.md` | Typed TypeScript contracts and adapters for native capabilities. Keep platform transport separate from product policy; maintain web/test fallbacks where present. |
| `src/components/AGENTS.md` | Presentation, interaction, and accessibility. Do not put persistence or native platform policy directly in components. Preserve touch, keyboard, VoiceOver semantics, and reduced-motion behavior where applicable. |
| `packages/ApplePlatformServices/AGENTS.md` | Testable Swift service implementations and platform abstractions. Package tests prove only package code, not app-target plugin code. |
| `ios/App/App/AGENTS.md` | Thin Capacitor/native composition and app lifecycle. Do not accumulate testable domain or CloudKit behavior in the app target without recording the debt and approval. Xcode capability or signing changes are high risk. |

Do not pretend the desired boundary is already fully achieved. Each scoped file must include a **Current exceptions** section linking to known debt.

### 8.4 `docs/CURRENT_STATE.md`

This is the first file a new agent should use to orient itself. Include:

- last verified date;
- verified branch, commit, and PR link;
- relationship between `main` and the active development checkpoint;
- implemented features, partially implemented features, manual-only gates, proposed work, and unresolved decisions;
- known architectural exceptions and test gaps;
- exact local verification commands;
- links to product spec, architecture index, ADR index, feature status, test matrix, active plans, CI, and physical acceptance plan;
- a warning that the document must be updated whenever the canonical development branch changes or a feature changes maturity.

Use commit identifiers, not phrases such as “latest” or “current PR,” without an accompanying date and link.

### 8.5 `docs/FEATURE_STATUS.md`

Inventory material features using only these states:

- **Implemented:** code exists and automated tests or direct implementation evidence support it.
- **Partial:** some flow exists but a required path or guarantee is missing.
- **Manual gate:** implementation exists but release confidence depends on an unperformed or externally performed test.
- **Proposed:** documented but not implemented.
- **Deferred:** intentionally outside the current release.
- **Unresolved:** policy or behavior still requires a decision.

For each feature provide status, implementation paths, automated tests, manual tests, known gaps, and last verified checkpoint. At minimum cover page lifecycle, local persistence, drawing, recording, playback, transcription, CloudKit backup, recovery/history, multi-device behavior, My Story, shapes, accessibility, and release readiness.

### 8.6 Architecture documentation

Create:

```text
docs/architecture/
  INDEX.md
  boundaries.md
  invariants.md
  data-lifecycle.md
  drawing.md
  audio-transcription.md
  backup-recovery.md
  accessibility.md
```

Requirements:

- `INDEX.md` gives a one-screen system map and routes a reader by type of change.
- `boundaries.md` documents the current dependency boundaries and known exceptions.
- `invariants.md` defines the invariants in Section 5 with implementation and test links.
- `data-lifecycle.md` traces create, edit, save, delete, history, restore, and failure behavior.
- `drawing.md` distinguishes editable PencilKit data from derived previews and documents touch/accessibility constraints.
- `audio-transcription.md` traces permission, recording, durable storage, playback, explicit transcription, editing, and failure behavior.
- `backup-recovery.md` documents what is local, what enters CloudKit/iCloud, operation/history behavior, restore behavior, and all unresolved conflict semantics.
- `accessibility.md` identifies supported interactions and the automated versus physical verification split.

Architecture pages must describe the current implementation first. Desired future boundaries belong in a clearly labelled **Target state** or active plan section.

### 8.7 Architecture decisions

Create an ADR index and the following decision records:

```text
docs/adr/
  README.md
  0001-hybrid-react-capacitor-ipad-app.md
  0002-pencilkit-data-is-the-editable-drawing-authority.md
  0003-local-durability-before-cloud-backup.md
  0004-cloudkit-icloud-backup-and-recovery.md
  0005-user-triggered-transcription-preserves-audio.md
  0006-accessibility-and-supported-ipad-baseline.md
  0007-multi-device-conflict-policy.md
```

Every ADR must contain: status, date, context, decision, alternatives or prior direction, consequences, evidence, and superseded documents.

Special handling:

- ADR 0004 must explain that CloudKit/iCloud is the current implementation direction and identify the former Supabase wording it supersedes. It must not claim guarantees not demonstrated by code or tests.
- ADR 0005 must distinguish the current explicit **Convert to text** flow from the older automatic-transcription wording.
- ADR 0007 must be **Proposed** or **Unresolved** unless the code and tests prove a complete, intentional conflict policy. Do not invent one.

### 8.8 `docs/TEST_MATRIX.md`

Create a traceability matrix with these columns:

| Invariant or flow | Implementation path | Automated test | CI job | Manual acceptance test | Coverage state | Gap/owner |
|---|---|---|---|---|---|---|

Use only these coverage states: **Automated**, **Partial**, **Manual only**, **Missing**, **Not applicable**.

Inventory actual Vitest and Swift tests; do not repeat test counts from PR prose without verifying them at the checked-out commit. Link manual iPad checks to `Specs/physical-ipad-acceptance.md` and/or `APP_RELEASE_TEST_PLAN.txt` as appropriate.

Explicitly record that tests in `packages/ApplePlatformServices` do not directly exercise CloudKit implementation that remains inside `ios/App/App/JournalAudioPlugins.swift`. This is a coverage gap, not a failure to be hidden.

### 8.9 Planning structure

Create:

```text
docs/plans/
  README.md
  active/
  completed/
  active/modularisation.md
```

`docs/plans/README.md` must define plan lifecycle and a standard template. Every active plan must contain:

- problem and user outcome;
- verified baseline and evidence;
- scope and non-scope;
- affected boundaries and invariants;
- alternatives considered;
- ordered implementation steps;
- test plan and manual gates;
- risks and rollback;
- approval points;
- completion record.

`active/modularisation.md` is a future plan only. Prioritize these candidate seams based on evidence:

1. move testable CloudKit backup/recovery behavior out of `JournalAudioPlugins.swift` and behind a package/service boundary;
2. reduce `AppDelegate.swift` to composition and lifecycle responsibilities;
3. split `JournalPage.tsx` into feature components and orchestration with stable contracts;
4. split `src/domain/operations.ts` by aggregate or operation family without changing semantics;
5. reduce `src/App.tsx` orchestration breadth;
6. split `src/styles.css` by feature or layer without changing rendered behavior.

For each candidate include prerequisite characterization tests, intended seam, risk, acceptance gate, and a recommendation for one change per PR. Do not perform any of these refactors in this implementation.

### 8.10 Reconcile existing documents

Update existing documents only after the current code and tests have been inspected.

#### `Specs/ivans-journal-spec.md`

- Replace the obsolete Supabase architecture direction with an accurate CloudKit/iCloud description supported by the active implementation.
- Correct the recording flow so transcription is user-triggered with **Convert to text**.
- Preserve the rule that original audio remains available and authoritative.
- Clearly label proposed or unresolved multi-device conflict behavior.
- Link to the relevant ADRs for technical detail.
- Avoid rewriting unrelated product prose.

#### `Specs/next-stage-plan.md`

- Mark it **Historical** if its stages are no longer active.
- Add a header giving its original purpose, the checkpoint at which it was assessed, and links to `docs/CURRENT_STATE.md`, `docs/FEATURE_STATUS.md`, and active plans.
- Do not delete useful history or rewrite it to look as if it predicted the current architecture.

#### `README.md`

Add a short **For contributors and coding agents** section linking to:

- `AGENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/architecture/INDEX.md`
- `docs/adr/README.md`
- `docs/TEST_MATRIX.md`
- `docs/plans/README.md`

Keep installation and product information intact.

## 9. Current architectural boundary model

Use this model when documenting the system and evaluating a proposed change:

| Layer | Owns | Must not own |
|---|---|---|
| Domain (`src/domain`) | Product types, deterministic rules, operations, invariants | React rendering, browser persistence, Capacitor calls, Swift/platform transport |
| Repository (`src/repository`) | Persistence interfaces, local durability, serialization/migrations | View state, visual policy, direct component behavior |
| Native TypeScript (`src/native`) | Typed native contracts, capability detection, adapters | Journal product policy or hidden fallback semantics |
| Hooks/orchestration | Coordination of use cases and UI state | New persistence formats or platform implementations |
| Components (`src/components`) | Presentation, interaction, accessibility | Direct durable-storage or CloudKit policy |
| Swift packages (`packages/ApplePlatformServices`) | Testable Apple platform services and abstractions | React/UI product decisions |
| iOS app target (`ios/App/App`) | Capacitor registration, composition, lifecycle, entitlement-bound integration | Large untestable service implementations as a target state |

The last boundary describes a target constraint, not a claim that the current app target is already thin. `JournalAudioPlugins.swift` and `AppDelegate.swift` are known exceptions that must be documented.

## 10. Reviewable reasoning record

Do not request or produce private chain-of-thought. For each non-trivial plan or decision, expose a concise engineering record with:

1. **Evidence:** exact files, symbols, tests, commands, commit, and observed result.
2. **Assumptions:** facts that were not directly verified.
3. **Constraints and invariants:** rules the change must preserve.
4. **Options:** viable approaches and concrete trade-offs.
5. **Decision or recommendation:** selected approach and why it best satisfies the evidence and constraints.
6. **Risks:** likely failure modes, blast radius, and rollback.
7. **Verification:** automated and manual proof required.
8. **Open questions:** decisions that remain with the maintainer.

Keep this record focused on information a reviewer can verify.

## 11. Risk tiers and approval

| Tier | Examples | Required behavior |
|---|---|---|
| Low | Documentation links, correcting factual status, adding scoped rules | Include in reviewed plan; implement after Phase 0 approval. |
| Medium | Test-only changes, internal refactor with no behavior or schema change | Separate plan with affected invariants and characterization tests; wait for explicit approval. |
| High | Persistence/schema/migration, CloudKit record behavior, conflict policy, native bridge APIs, Xcode capabilities, deletion/history semantics, dependency changes | Stop. Present evidence, options, rollback, and explicit decision request before editing. |
| Physical release gate | Microphone, Pencil, iCloud account, two-device behavior, VoiceOver, actual first-generation iPad Pro | Never infer from simulator or unit tests. Report as not run unless performed on the required hardware. |

This specification authorizes only the low-risk documentation and rules work after the Phase 0 report is approved.

## 12. Implementation phases

### Phase 0 — Read-only repository confirmation

**No file modifications are permitted in this phase.**

1. Inspect `git status`, current branch, current commit, remotes, and recent history.
2. Confirm whether the intended base is PR #4 commit `fe5c9e171cd34e384f304000e99351b098e73ed7`, a descendant of it, or a different maintainer-selected checkpoint.
3. Identify uncommitted or untracked work without modifying, stashing, or deleting it.
4. Read `README.md`, all `Specs/*.md`, `APP_RELEASE_TEST_PLAN.txt`, CI configuration, package manifests, TypeScript/Swift contracts, repository composition, and representative tests.
5. Locate existing agent instructions, architecture docs, ADRs, and plans. Do not assume they are absent because this specification says they were absent at an earlier checkpoint.
6. Verify the known documentation contradictions against the checked-out code.
7. Inventory tests and verification commands; run no commands that change generated or tracked files.
8. Produce the Phase 0 report in Section 13 and stop for approval.

### Phase 1 — Agent-rule scaffolding

After approval:

1. create root `AGENTS.md`;
2. create the minimal Cursor rule;
3. create scoped `AGENTS.md` files;
4. ensure all rules point to canonical docs and do not duplicate long descriptions;
5. check that every changed source subtree has a clear applicable rule.

No production code changes.

### Phase 2 — Current state and architecture

1. create `docs/CURRENT_STATE.md` and `docs/FEATURE_STATUS.md`;
2. create the architecture index and topic pages;
3. create the ADR index and ADRs;
4. distinguish implemented behavior, intended architecture, manual gates, and unresolved policy;
5. link every significant claim to an implementation path, test, PR, or decision record.

No production code changes.

### Phase 3 — Specification reconciliation

1. correct the Supabase/CloudKit contradiction;
2. correct the automatic/user-triggered transcription contradiction;
3. mark the stale next-stage plan historical without erasing it;
4. add navigation from README;
5. search for remaining contradictory terms and report every match.

No production code changes.

### Phase 4 — Test and invariant traceability

1. inventory actual Vitest, Swift package, build, and manual acceptance coverage;
2. complete `docs/TEST_MATRIX.md`;
3. identify missing, partial, and manual-only coverage explicitly;
4. record the app-target CloudKit coverage gap;
5. do not add product tests or refactor implementation in this phase.

### Phase 5 — Modularisation plan

Create only `docs/plans/active/modularisation.md` using the candidate seams in Section 8.9. Make each future increment independently reviewable and behavior-preserving. Do not implement it.

### Phase 6 — Verification and handoff

1. review the diff against the allowlist;
2. check internal links and terminology;
3. run the verification in Section 14;
4. report any unavailable environment or physical-device gates as not run;
5. produce the final handoff in Section 15.

## 13. Mandatory Phase 0 report

Before editing, return exactly these sections:

```md
# Phase 0 Repository Evidence Report

## Checkpoint
- Branch:
- Commit:
- Relationship to PR #4 checkpoint:
- Working tree state:

## Instruction files already present
- Path and scope for each, or “none found”:

## Current architecture map
- Domain:
- Repository/persistence:
- Native TypeScript boundary:
- Swift packages:
- iOS app composition/plugins:
- UI/orchestration:

## Product invariants and evidence
| Invariant | Implementation | Test/manual gate | Confidence |

## Documentation contradictions
| Topic | Source A | Source B/code | Recommended documentation resolution |

## Existing verification baseline
- Commands run:
- Results:
- Commands unavailable and why:

## Proposed file changes
| Path | Purpose | Risk tier |

## Assumptions and open decisions
- Assumptions:
- Decisions requiring maintainer input:

## Stop-condition check
- Any stop condition triggered: yes/no
- Details:
```

The executor must stop after this report. Approval of the report authorizes only Phases 1–6 within the allowlist.

## 14. Verification requirements

Run from the repository root at the approved checkpoint.

### Static diff checks

```bash
git diff --check
git status --short
git diff --name-only
```

Confirm every changed file is in the Section 7 allowlist.

### Web validation

Use the repository-pinned Node version and clean dependency installation where the environment permits:

```bash
npm ci
npm run validate
```

At the audited checkpoint, `validate` covers type checking, linting, Vitest coverage, and the production build. If the checked-out scripts differ, report the difference rather than substituting a weaker command silently.

### Swift package validation

```bash
swift test --package-path packages/ApplePlatformServices
```

### iOS composition build on macOS

If and only if Xcode and the required macOS runner are available:

```bash
npm run cap:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Use the exact project/workspace command in the checked-out CI if it differs from this audited command.

### Documentation verification

- all relative links resolve;
- all referenced paths exist at the approved checkpoint;
- no current document presents Supabase as the active backend direction;
- no current document says transcription is automatic after stopping unless explicitly labelled historical;
- every critical invariant appears in `docs/TEST_MATRIX.md`;
- every unresolved behavior is labelled unresolved, not implemented;
- counts, commits, and dates are verified rather than copied from prose.

### Physical-device verification

Do not mark the physical acceptance plan passed as part of this change unless it was actually run. Automated and simulator success do not prove microphone routing, Pencil behavior, iCloud account flows, two-iPad behavior, VoiceOver, performance, or first-generation iPad Pro compatibility.

## 15. Mandatory final handoff

Return:

```md
# Implementation Handoff

## Outcome
One paragraph describing what became safer or clearer.

## Checkpoint
- Base branch/commit:
- Final commit or working-tree state:

## Files changed
| Path | Summary |

## Decisions recorded
| ADR | Status | Consequence |

## Contradictions resolved
| Topic | Resolution | Evidence |

## Verification
| Command/gate | Result |

## Not run
- Gate and reason:

## Known gaps
- Gap, risk, and recommended next action:

## Scope confirmation
- Production behavior changed: no
- Persistence/schema changed: no
- Dependencies changed: no
- Tests weakened or removed: no
- Physical release readiness claimed: no
```

## 16. Stop conditions

Stop without editing, or stop at the safest reversible point, if any of these is true:

- the checked-out branch or commit is not the approved checkpoint and its relationship cannot be established;
- the working tree contains overlapping user changes;
- existing `AGENTS.md` or `.cursor/rules` instructions conflict with this specification;
- code, tests, and product intent disagree in a way that requires a product decision;
- an edit would leave the allowlist;
- an edit would change runtime behavior, a native contract, stored data, CloudKit behavior, signing, capabilities, or dependencies;
- baseline validation fails before the documentation changes;
- a multi-device conflict policy would need to be invented;
- the agent would need to call a manual or physical gate “passed” without performing it;
- an existing document cannot be corrected without losing meaningful historical context.

Report the evidence, impact, and smallest decision needed to proceed.

## 17. Acceptance criteria

The implementation is complete only when all of the following are true:

- A fresh Cursor agent sees a concise root rule and relevant scoped rule before editing.
- The active branch and commit are explicit and dated.
- `main` versus active development state is explained.
- Current behavior, target architecture, historical plans, and proposed work are visibly distinct.
- Supabase is not described as the current backend direction.
- Transcription is documented as explicit **Convert to text** behavior and original audio remains preserved.
- The architecture index routes changes to the correct layer and test suite.
- Every critical invariant maps to implementation and automated or manual evidence.
- The CloudKit app-target test gap is visible.
- Unresolved conflict semantics are not presented as settled.
- Large-file refactoring exists only as a staged future plan.
- All changes stay within the allowlist.
- Automated validation passes, or an unchanged pre-existing/environment limitation is reported precisely.
- No physical-device or release-readiness claim is inferred from unit tests or a simulator build.
- The final handoff contains evidence a maintainer can verify without reading the agent’s hidden reasoning.

## 18. Copy-ready Cursor kickoff prompt

Paste the following into Cursor with this specification available at `Specs/agent-readiness-implementation-spec.md`:

```text
Implement Specs/agent-readiness-implementation-spec.md for Ivan’s Diary.

Use Cursor Plan Mode. Perform Phase 0 only in this turn. Do not modify, create,
format, generate, stash, or delete any file. Do not install dependencies unless
they are already required for a read-only baseline command and installation will
not modify tracked files.

First read the entire implementation specification. Then inspect the repository,
including any existing AGENTS.md and .cursor/rules instructions. Verify the actual
branch, commit, working tree, architecture, documents, tests, and CI. The audited
reference checkpoint is PR #4 commit
fe5c9e171cd34e384f304000e99351b098e73ed7, but do not switch branches or assume
that checkpoint is still canonical. Report its relationship to the checked-out
commit.

Return the exact “Phase 0 Repository Evidence Report” required by Section 13.
Use exact paths, symbols, test names, commands, and observed results. Expose
reviewable engineering evidence, assumptions, options, risks, and verification;
do not provide private chain-of-thought. Flag contradictions and decisions rather
than guessing.

Stop after the report and wait for explicit approval before making any edit.
```

After the Phase 0 report is approved, use this continuation prompt:

```text
The Phase 0 report is approved. Implement Phases 1–6 within the specification’s
allowlist. Keep the change documentation-and-rules-only. Do not modify runtime
behavior, tests, dependencies, persistence, CloudKit behavior, Xcode settings, or
generated files. If new evidence triggers a stop condition, stop and report it.

Work phase by phase, keeping a short evidence log. Run the required verification
and finish with the exact Implementation Handoff from Section 15.
```

## 19. Audited references

- [IvanDiary repository](https://github.com/benresonance-star/IvanDiary)
- [Active draft PR #4](https://github.com/benresonance-star/IvanDiary/pull/4)
- [Verified PR checkpoint](https://github.com/benresonance-star/IvanDiary/tree/fe5c9e171cd34e384f304000e99351b098e73ed7)
- [Successful CI run at the audited development line](https://github.com/benresonance-star/IvanDiary/actions/runs/32722231556)
- [Cursor Rules documentation](https://cursor.com/docs/rules)
- [Cursor Plan Mode documentation](https://cursor.com/docs/agent/plan-mode)

