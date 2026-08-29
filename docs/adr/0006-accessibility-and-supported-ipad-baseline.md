# ADR 0006: Accessibility and supported iPad baseline

## Status

Accepted

## Date

2026-08-25

## Context

Ivan's Diary is voice-first and Pencil-first, but it must remain operable with finger input, keyboard input, and assistive technologies. The Swift package and Xcode project use an iOS 15 deployment baseline, including compatibility constraints for first-generation iPad Pro. The current Xcode target is iPad-only (`TARGETED_DEVICE_FAMILY = 2`), while the product specification describes iPhone as a secondary device and includes a proposed iPhone UI.

## Decision

The current supported release target is iPad-only with an iOS/iPadOS 15 baseline, including first-generation iPad Pro constraints. Preserve semantic controls, clear accessible names and states, logical VoiceOver order, sufficient contrast, reduced-motion behavior, keyboard support, and finger operation alongside Pencil use. Treat iPhone support as longer-term product intent, not a capability of the current release target, until a separately approved platform decision and implementation change.

## Alternatives or prior direction

- Pencil-only interaction is rejected because it would exclude touch and assistive use.
- Raising the OS baseline or dropping first-generation iPad Pro is not authorized by current evidence.
- `Specs/ivans-journal-spec.md` presents responsive iPhone support as product intent; current project settings and the release plan instead establish an iPad-only submission target.

## Consequences

- Accessible semantics are product requirements, not optional polish.
- Browser automation can cover semantics, but VoiceOver, Switch Control, Pencil/finger behavior, microphone behavior, and oldest-device performance require physical hardware.
- iPhone-specific claims must be labelled proposed or future until the target and acceptance coverage change.
- Deployment target or device-family changes are high-risk project decisions and are outside documentation-only work.

## Evidence

- `packages/ApplePlatformServices/Package.swift` targets iOS 15.
- `ios/App/App.xcodeproj/project.pbxproj` records `IPHONEOS_DEPLOYMENT_TARGET = 15.0` and `TARGETED_DEVICE_FAMILY = 2`.
- `src/components/accessibility.test.tsx` supplies automated accessibility evidence.
- `packages/ApplePlatformServices/Tests` includes first-generation iPad speech-capability and native drawing gesture-policy tests.
- `Specs/physical-ipad-acceptance.md` and `APP_RELEASE_TEST_PLAN.txt` define physical accessibility and iPad release gates.

## Superseded documents

- `Specs/ivans-journal-spec.md` is superseded only where it implies iPhone is part of the current supported release; its iPhone sections remain future product intent.
- No accessibility requirement is superseded.
