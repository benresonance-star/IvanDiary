# Ivan's Diary

An accessible, voice-first journal for iPad and iPhone. The application uses a
React and TypeScript interface inside a Capacitor iOS shell. Drawing, page
composition and local-first data contracts are kept independent from native
audio, transcription and file services.

## Current milestone

The Windows development foundation includes:

- the responsive Interface V2 shell;
- an isolated, pressure-aware Canvas 2D `SketchSurface`;
- whole-stroke erasing and undo;
- versioned journal, drawing and native-plugin contracts;
- a transactionally committed IndexedDB snapshot and operation log;
- operation replay, idempotency, schema migration and recovery tests;
- working Diary, Sketchbooks, Favourites and accessibility Settings views;
- constrained text, photo, link, transcript and voice-card composition;
- an accessible Arrange mode for moving and stretching page objects;
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

The iOS project should be added on the development Mac after Xcode 26 is ready:

```sh
npm install @capacitor/ios
npx cap add ios
npm run cap:sync
```
