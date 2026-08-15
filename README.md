# Ivan's Diary

An accessible, voice-first journal for iPad and iPhone. The application uses a
React and TypeScript interface inside a Capacitor iOS shell. Drawing, page
composition and local-first data contracts are kept independent from native
audio, transcription and file services.

## Current milestone

The Windows development foundation includes:

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
- clearly labelled browser audio/transcription simulations; and
- strict type checking, linting, unit tests and production builds.

The browser repository is only for development. The production iOS repository
will use SQLite and native durable files. Voice controls intentionally do not
access the microphone: browser recording and transcription are explicitly
labelled demonstrations until the AVFoundation and Apple Speech bridges are
installed and tested.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

See the [next-stage implementation plan](Specs/next-stage-plan.md) for the
native local-reliability sequence and acceptance gates.

The Capacitor iOS shell is checked in. After pulling native changes on the Mac:

```sh
npm install
npm run cap:sync
```

On iPad, **Draw** and **Erase** keep you on the journal page and activate an
in-place PencilKit overlay aligned to the paper. Leaving Draw/Erase saves a
PNG preview onto the page. The browser keeps the web canvas for Windows
development.

PencilKit uses the local package at `packages/ApplePlatformServices`. In
Xcode, choose **File → Add Package Dependencies… → Add Local…**, select that
folder, and add the `AppleDrawingKit` product to the **App** target. This
one-time Xcode action records the package reference in the project. Do not
edit `project.pbxproj` manually.
