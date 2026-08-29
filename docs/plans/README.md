# Engineering plans

Plans make non-trivial changes reviewable before implementation. They describe evidence, boundaries, decisions, and proof; they do not authorize work by themselves.

## Lifecycle

1. **Draft:** create the plan in `active/` from the template below. Verify the baseline and identify unresolved decisions.
2. **Evidence review:** a maintainer reviews the problem, current behavior, affected invariants, alternatives, and risk tier.
3. **Approval:** record explicit approval at every listed approval point. Medium- and high-risk work must not begin without the approval required by `AGENTS.md`.
4. **Implementation:** make the smallest coherent increment. Use one independently reviewable behavior-preserving change per PR unless the approved plan says otherwise.
5. **Verification:** run the approved automated checks and report physical/manual gates as passed only when actually performed.
6. **Completion:** fill in the completion record, including deviations and remaining gaps. Move the plan from `active/` to `completed/` in the completing PR.
7. **Supersession or cancellation:** record the reason and replacement, if any, then move the plan to `completed/`; do not silently delete its decision history.

`active/` contains proposed or in-progress work. `completed/` contains implemented, superseded, or cancelled plans. Directory presence does not imply approval.

## Standard template

```md
# <Plan title>

**Status:** Draft | Approved | In progress | Blocked | Completed | Superseded | Cancelled
**Owner:**
**Created:**
**Verified baseline:** branch, commit, date, commands, and relevant evidence
**Risk tier:** Low | Medium | High | Physical release gate

## Problem and user outcome
State the observed problem and the user-visible or safety outcome.

## Baseline and evidence
List exact files, symbols, tests, commands, and observed results. Separate verified facts from assumptions.

## Scope
- In scope:
- Out of scope:

## Boundaries and invariants
Name affected architecture boundaries and product invariants. Link the test matrix and relevant ADRs.

## Alternatives considered
Describe viable options, trade-offs, and the recommendation. Do not invent unresolved product policy.

## Ordered implementation steps
Use independently reviewable increments. Identify the intended seam and keep behavior/schema/API changes explicit.

## Test plan and manual gates
List characterization tests first, then focused tests, validation, simulator/build checks, and physical gates. Never infer physical success.

## Risks and rollback
Describe likely failure modes, blast radius, detection, and the smallest safe rollback.

## Approval points
- [ ] Baseline and problem approved before implementation.
- [ ] Architecture/API/schema/product decisions explicitly approved before editing.
- [ ] Manual or physical gate owner identified.
- [ ] Completion and remaining gaps accepted.

## Completion record
- Final PR/commit:
- Changes delivered:
- Verification and results:
- Manual gates not run:
- Deviations:
- Remaining risks/follow-ups:
- Completion decision/date:
```

## Approval rules

- Documentation correction is low risk but still reviewed.
- Characterization tests and internal refactors are medium risk and need an approved plan before edits.
- Persistence formats, migrations, CloudKit record behavior, conflict policy, native bridge APIs, Xcode capabilities, deletion/history semantics, and dependencies are high risk. Stop and request an explicit decision with options and rollback.
- Hardware, microphone, Pencil, iCloud account, multi-device, VoiceOver, and first-generation iPad Pro checks remain physical release gates.

See the [active modularisation plan](active/modularisation.md), [current state](../CURRENT_STATE.md), [architecture boundaries](../architecture/boundaries.md), and [test matrix](../TEST_MATRIX.md).
