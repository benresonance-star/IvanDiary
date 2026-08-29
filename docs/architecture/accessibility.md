# Accessibility

## Current implementation

The React interface uses semantic buttons, tabs, dialogs, headings and status messaging with accessible names. Primary workflows support touch and keyboard controls; drawing keeps finger input configurable; shape and page arrangement expose non-drag actions. Settings provide standard/large/extra-large text, high contrast, reduced motion and a standard app appearance. Swift drawing policy reserves Pencil for drawing without making Pencil the only input.

Automated evidence includes:

- `src/components/accessibility.test.tsx` for named navigation and preference semantics;
- component tests for dialogs, confirmations, page strips, shape keyboard/on-screen adjustments and accessible drawing starters;
- `eslint-plugin-jsx-a11y` through `npm run lint`;
- `NativeDrawingGesturePolicyTests.swift` for Pencil/content gesture policy.

Automated tests do not prove usable target sizes, reading order, announcements, visual clipping, hardware gestures or assistive technology on iPad.

## Physical verification split

The [physical iPad acceptance plan](../../Specs/physical-ipad-acceptance.md) separately requires VoiceOver, Switch Control, text sizes, high contrast, native keyboard behavior, touch/Pencil interaction, drawing overlays, Convert to text, interruption recovery and first-generation iPad Pro checks. Those checks are release gates and are **not reported as passed** by this documentation.

The current Xcode target is iPad-only (`TARGETED_DEVICE_FAMILY = 2`). The product specification's iPhone experience is future intent; it has neither a current target nor an accessibility acceptance baseline.

Any interaction change must preserve semantic names, touch, keyboard and assistive alternatives. No required action may depend on a precision gesture, colour alone or Apple Pencil.
