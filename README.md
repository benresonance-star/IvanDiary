# Ivan's Diary

An accessible, voice-first journal for iPad. The application uses a
React and TypeScript interface inside a Capacitor iOS shell. Drawing, page
composition and local-first data contracts are kept independent from native
audio, transcription and file services.

## Current milestone

The current implementation includes:

- the responsive Interface V2 shell;
- an isolated, pressure-aware Canvas 2D `SketchSurface`;
- a reusable PencilKit package used as the production iPad drawing editor;
- durable native `.pkdrawing` storage with PNG page and library previews;
- whole-stroke erasing and undo;
- versioned journal, drawing and native-plugin contracts;
- a transactionally committed IndexedDB snapshot and operation log;
- operation replay, idempotency, schema migration and recovery tests;
- working Diary, Sketchbooks, Favourites and accessibility Settings views;
- constrained text, photo, link, transcript and voice-card composition;
- an accessible Edit mode for moving and stretching page objects;
- durable multi-page diary days with visual, reorderable page thumbnails;
- named, multi-page sketchbooks using the full shared page workspace;
- typed or spoken sketchbook naming, renaming and directory reordering;
- native iPad audio recording and Apple Speech transcription alongside clearly
  labelled browser simulations; and
- strict type checking, linting, unit tests and production builds.

The browser repository is only for development. Production iOS stores the
journal snapshot, checkpoint and pending operation log atomically in protected
Application Support storage; recordings, photos and PencilKit drawings use
native durable files. Voice controls in the browser intentionally do not access
the microphone: browser recording and transcription remain explicitly labelled
demonstrations, while production iPad builds use native AVFoundation and Apple
Speech bridges.

## For contributors and coding agents

Start with [AGENTS.md](AGENTS.md) and the
[current implementation state](docs/CURRENT_STATE.md). See the
[architecture index](docs/architecture/INDEX.md),
[architecture decisions](docs/adr/README.md),
[test matrix](docs/TEST_MATRIX.md), and
[planning guide](docs/plans/README.md) before making changes.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

The former [next-stage implementation plan](Specs/next-stage-plan.md) is
retained as historical context; current work is tracked in
[active plans](docs/plans/README.md).

The Capacitor iOS shell is checked in. After pulling native changes on the Mac:

```sh
npm install
npm run cap:sync
```

On iPad, **Draw** and **Erase** keep you on the journal page and activate an
in-place PencilKit overlay aligned to the paper. Leaving Draw/Erase saves a
PNG preview onto the page. The browser keeps the web canvas for Windows
development.

The Apple services use the local package at `packages/ApplePlatformServices`.
The checked-in Xcode project already links its `AppleDrawingKit` and
`AppleAudioServices` products to the **App** target. If the package reference
ever needs restoring, use **File → Add Package Dependencies… → Add Local…** in
Xcode and select that folder. Do not edit `project.pbxproj` manually.
