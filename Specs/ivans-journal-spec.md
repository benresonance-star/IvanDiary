# Ivan's Diary / My Journal — Product and Technical Specification

**Status:** Revised implementation baseline  
**Primary user:** Ivan  
**Current release device:** iPad Pro with Apple Pencil

**Future device intent:** iPhone (not part of the current release)
**Working product names:** Ivan's Diary (user-facing candidate), My Journal
(internal/general name)

The historical Interface V2 reference image is not checked into this
repository.

The reference image establishes the intended interaction hierarchy and visual
direction. It is not a pixel-perfect implementation contract. Accessibility,
device size, keyboard visibility, and content density may require responsive
adjustments.

## 1. Purpose

Ivan's Diary is currently an iPad journaling and sketching app for a person who
prefers **voice and drawing over typing**. An iPhone experience remains future
product intent.

The app should feel like a **personal paper journal and sketchbook**,
not a productivity tool.

**Core principle:** Voice first. Drawing equal to writing. Transcription
and future intelligence stay in the background.

The primary success criterion is:

> Ivan can open the app, draw, speak, close it, and later return to
> exactly what he made and hear his own voice.

------------------------------------------------------------------------

## 2. Product Principles

-   Voice input is first-class, not an accessibility add-on.
-   Preserve the user's original voice recordings permanently.
-   Preserve the character of the user's hand rather than beautifying or
    over-smoothing it.
-   Make the app feel tactile and paper-like rather than like a blank
    digital canvas.
-   Keep navigation and controls simple, large, and forgiving.
-   Support Apple Pencil, but never make the Pencil essential; core
    actions must work with finger input.
-   Auto-save continuously. No manual save workflow.
-   A change is not described as saved until it is durable on the device.
-   Local durability and cloud synchronization are separate states.
-   Default to a simple interface with only essential controls. Helper and
    appearance settings must not clutter the normal journal workflow.
-   Keep the first release focused. AI memory, reflection, story
    generation, and semantic search are later features.

------------------------------------------------------------------------

## 3. Main Sections

### 3.1 Journal

Daily entries organised automatically by date.

Each day may contain:

-   one or more pages
-   drawings and handwriting
-   voice recordings
-   Apple voice-to-text transcripts
-   typed text
-   photographs
-   pasted web links

A daily journal entry should have a visual thumbnail. Prefer, in order:

1.  a representative drawing from the entry
2.  a photograph
3.  handwriting
4.  a simple paper cover

Journal browsing should support:

-   Days
-   Months
-   Years

The library should be highly visual, allowing the user to recognise days
through their own drawings rather than relying only on dates or titles.

### 3.2 Pages

Each journal day may contain multiple paper pages.

A page supports:

-   freehand Apple Pencil drawing
-   finger drawing
-   handwriting
-   typed text
-   photographs
-   voice recordings
-   voice transcript blocks
-   pasted link blocks

Pages auto-save continuously.

The first release uses a **constrained free-form page**:

-   drawing may occur anywhere on the paper
-   new voice, transcript, photo, text and link objects receive sensible
    automatic positions
-   objects may be moved with forgiving drag gestures
-   text and transcripts remain readable blocks
-   arbitrary layering, alignment tools, free rotation and complex page
    design controls are not exposed

### 3.3 Sketchbooks

Sketchbooks are separate from the date-based Journal.

Users can create named sketchbooks such as:

-   Animals
-   Ideas
-   People
-   Places

Sketchbook pages use the same page and drawing engine as journal pages.

Pages should eventually be movable or copyable between sketchbooks and
journal entries.

### 3.4 Favourites

Ivan or a helper can mark a journal day, page or sketchbook page as a
favourite. Favourites are available through a simple visual filter without
introducing another complex navigation section.

------------------------------------------------------------------------

## 4. Voice Recording

Voice recording is a primary interaction.

Provide a large, obvious microphone control.

Intended flow:

**Tap microphone → begin durable local recording → Record → Stop → finalise
original audio locally → optionally choose Convert to text → attach the
transcript to the page → back up in the background**

Stopping preserves the original audio and does not automatically request
transcription. The current voice-card component does not render its
**Convert to text** action, so user-triggered transcription from a saved
recording remains unresolved rather than implemented. See
[ADR 0005](../docs/adr/0005-user-triggered-transcription-preserves-audio.md).

Always preserve:

-   original audio recording
-   raw Apple transcript
-   optional edited transcript

The transcript must never replace or overwrite the original recording.

A page may contain multiple recordings.

Recordings appear as simple playable page objects, for example:

`▶ ━━━━━━━━━━━━━ 0:58`

Voice recording remains useful even if transcription fails.

Recording implementation requirements:

-   write audio incrementally to an app-controlled local file
-   recover or clearly identify an interrupted recording
-   never wait for transcription or network upload before preserving audio
-   use a stable recording ID shared by the audio asset and transcript
-   expose recording, processing, local-save and sync states without technical
    language

------------------------------------------------------------------------

## 5. Apple Voice-to-Text

Use Apple speech recognition as the primary transcription system because
the intended user already has success with Apple voice recognition.

Requirements:

-   support Apple speech recognition
-   support live transcription where practical
-   support transcription of completed recordings where appropriate
-   retain original audio independently of transcription
-   allow transcript correction
-   do not force transcript review after every recording
-   transcription failure must never prevent the recording being saved
-   use `SFSpeechRecognizer` as the compatibility path on iPadOS 15 and 16,
    including first-generation iPad Pro
-   prefer on-device recognition when the device and locale support it
-   use newer Apple speech APIs only after runtime capability checks and only
    when My Words recognition context is preserved
-   native text entry keeps Voice and Keyboard modes, inserts recognised speech
    at the current selection, and never discards typed text after an error
-   temporary audio created for text entry is deleted after success, failure,
    cancellation, interruption, or dismissal

The architecture should allow alternative transcription engines to be
added later without changing the stored original audio.

------------------------------------------------------------------------

## 6. Drawing

Optimise the primary drawing experience for iPad and Apple Pencil.

Requirements:

-   very low-latency drawing
-   pressure sensitivity
-   tilt where available
-   finger drawing
-   eraser
-   undo / redo
-   preserve original stroke/vector data
-   retain timestamp information for replay

Initial tools:

-   Draw, using the default fine black pen
-   Eraser
-   Undo

Pencil and Marker may be offered in a secondary Draw chooser after the
essential interaction has been validated with Ivan. Redo remains available
through a secondary action rather than occupying the primary toolbar.

Avoid large brush libraries.

The default pen should resemble a **fine black pen on warm sketchbook
paper**, reflecting the character of Ivan's existing doodles.

Do not aggressively smooth the user's marks.

------------------------------------------------------------------------

## 7. Drawing Replay — Post-MVP

Store the drawing process, not only the finished image.

Each stroke should retain enough temporal information to recreate the
drawing in sequence.

A later release may offer **Replay Memory**, combining:

-   drawing strokes appearing in their original order
-   original voice recordings playing at the correct time
-   photos or text appearing at the time they were added where practical

Suggested stroke data:

-   stroke ID
-   timestamp / relative session time
-   points
-   pressure
-   tilt
-   drawing tool
-   colour
-   width

Store the final page state separately so normal page loading does not
require replaying the history.

The implementation should store stroke/event data rather than video
wherever possible.

The MVP stores the timestamps and event relationships required for future
replay, but synchronized replay is not part of the MVP definition of done.

------------------------------------------------------------------------

## 8. Paper Appearance

The drawing surface should feel like paper rather than a flat white
application background.

Initial paper styles:

-   Warm Journal
-   Sketch Paper
-   Clean Paper
-   Warm Grey
-   Dark Paper

Optional later variants:

-   lined
-   dot grid

Requirements:

-   subtle, high-quality paper texture
-   avoid obvious repeating texture patterns
-   paper is a separate background layer
-   changing paper must not modify drawings, text, photos, or voice
    objects
-   maintain sufficient contrast for accessibility

**Warm Journal** should be the default.

### Drawing guides

Each diary and sketchbook page can independently keep a drawing grid. Grid
settings persist with that page across navigation, force-close, and relaunch.
The Draw settings provide:

-   On or Off
-   Small, Medium, or Large spacing
-   Lines or visible Dots
-   an adjustable guide colour
-   rotation in 15-degree steps with a direct Straighten action

The visible native iPad guide and stroke snapping must use the same origin,
spacing, and rotation. Guides are editing aids and are not baked into saved
strokes.

------------------------------------------------------------------------

## 9. Natural Ink Rendering

Digital strokes should visually interact with the paper.

Use subtle rendering effects such as:

-   pressure-dependent width
-   slight opacity variation
-   natural stroke taper
-   very subtle edge irregularity
-   restrained paper-grain interaction
-   small pigment/graphite density variation

Do not add heavy artificial noise.

Rendering realism must never compromise input latency.

Priority order:

1.  immediate Pencil response
2.  natural pressure behaviour
3.  preservation and replay of stroke data
4.  convincing paper interaction
5.  advanced brush simulation

------------------------------------------------------------------------

## 10. Fonts and Text

Use clean system/interface typography for application controls.

Journal and transcript text use a highly readable system or clean-print font
by default. A small selection of high-quality handwritten-style fonts may be
provided as an optional appearance setting.

Suggested categories:

-   natural handwritten print
-   relaxed notebook hand
-   simple handwritten serif
-   accessible clean print

Requirements:

-   adjustable font size
-   adjustable text contrast
-   readable defaults
-   typed text should feel compatible with handwritten pages
-   the full-size native iPad keyboard must appear when keyboard entry is
    requested
-   Apple keyboard dictation must remain available in text fields

The user's actual handwriting should remain as drawing/stroke data.
Handwriting recognition, if added later, should not visually replace the
original handwriting.

------------------------------------------------------------------------

## 11. Journal Library UI

The journal overview should primarily be visual.

Example structure:

``` text
AUGUST 2026

[ owl ]      [ mouse ]     [ tree ]
Sun 2        Mon 3         Tue 4
🎙 2          🎙 1          🎙 3

[ photo ]    [ writing ]   [ house ]
Wed 5        Thu 6         Fri 7
```

Each card should feel like a small piece of the original journal page.

Tapping the card opens the corresponding day.

The system should automatically choose a representative image, while
allowing the user or helper to override it with a simple **Use as
journal picture** action.

The library initially provides day/month browsing and a favourites filter.
Full-text search, People, Places and Tags are deferred until they can be added
without increasing Ivan's default navigation complexity.

------------------------------------------------------------------------

## 12. iPad UI

iPad is the primary creation device.

### Navigation

Minimal navigation:

-   Diary
-   Sketchbooks
-   Settings

### Main Workspace

The paper page should dominate the screen.

Follow **Interface V2** with a floating toolbar of large labelled
controls, including:

-   Draw
-   Erase
-   Photo
-   Text
-   Voice, visually prominent
-   Undo
-   Share, at the right end of the toolbar

Share captures the complete paper composition as a picture or PDF and opens
the iOS share sheet for Messages or Mail. A controlled paper-only capture uses
the saved drawing preview together with text, shapes, photographs and other
visible page content; alerts, toolbars and other workspace chrome cannot
appear. Voice recordings on the page are sent as separate playable files. The
PDF also includes a large-print **What was said** page from any transcripts,
and pasted web links stay tappable on the page plus a
large-print **Web links** page. Favourite stays after the today/earlier entry label, or beside
the sketchbook name, not in the toolbar.

The toolbar may wrap or change arrangement on smaller iPads, but it must keep
the same conceptual order. Advanced drawing tools, selection, redo and helper
actions belong in a secondary menu.

The page itself shows the date, drawing, photos, playable recordings and
readable transcript/text blocks. New non-drawing objects are placed
automatically into an uncluttered location and can be moved with forgiving
gestures.

Show a small unobtrusive status such as **Saved on this iPad**. Show remote
sync problems separately and only when the user or helper can take a useful
action.

Primary touch targets are at least 56 points. All interactive targets are at
least 44 by 44 points including their invisible hit area.

------------------------------------------------------------------------

## 13. iPhone UI

This section records future product intent. The current release target is
iPad-only.

iPhone focuses on:

-   browsing the journal
-   voice journaling
-   reviewing pages
-   adding photographs
-   listening to previous recordings
-   transcript correction
-   light drawing

Suggested bottom navigation:

**Diary \| Voice \| Sketchbooks \| Settings**

Voice should have a prominent central microphone control.

Full drawing remains available but may use a simplified layout compared
with iPad.

People, Places, Tags and advanced search are not primary iPhone navigation in
the MVP.

------------------------------------------------------------------------

## 14. Technical Direction

### Front End

-   React and TypeScript
-   Capacitor 8 native iOS shell
-   responsive iPad layouts; iPhone adaptation is future work
-   native iOS keyboard, permissions, lifecycle and sharing integration

The React application provides navigation, journal composition, text,
photographs, links, voice-player objects, settings and responsive layouts.
Capacitor packages the application in WKWebView and exposes typed bridges to
native Swift services.

The architecture should keep the drawing/page engine reusable across
Journal and Sketchbooks.

### Drawing Engine

The initial implementation uses a vector/stroke-based web drawing layer
integrated with the React paper page. It selectively reuses proven concepts
and small pure modules from WeSketch, but does not fork or copy the WeSketch
editor, AI features, project model or persistence schema.

The drawing layer supports:

-   Pointer Events
-   Apple Pencil pressure
-   tilt where browser APIs expose it
-   explicit pen, touch and mouse input policies
-   coalesced samples where supported, with a tested fallback
-   timestamped stroke storage
-   finger drawing
-   whole-stroke erasing and undo/redo
-   versioned stroke serialization

Canvas, WebGL, or WebGPU rendering may be used where appropriate for
natural brush rendering, provided latency remains low.

The web drawing approach must pass a hardware gate on the oldest supported
iPad. The gate measures Pencil latency, palm and finger behaviour, cancellation
recovery, memory use and large-document performance. If it fails, replace only
the drawing surface with a native PencilKit editor presented through a custom
Capacitor plugin. Do not lower the product's drawing standard to preserve a
web-only implementation.

### Native iOS Services

Implement app-local Capacitor plugins in Swift for critical platform
capabilities:

-   **JournalAudio:** AVFoundation recording to an app-controlled local file,
    interruption handling, duration and playback metadata
-   **AppleTranscription:** Speech framework transcription using the preserved
    recording or shared live audio stream
-   **JournalFiles:** durable file placement, atomic finalisation, checksums,
    storage-health reporting and safe deletion
-   **AppLifecycle:** background/foreground notifications and final local
    flush requests
-   **NativeShare:** iOS share-sheet export where required

Community plugins may be evaluated, but original-audio preservation and
interruption recovery must be verified from their implementation. A speech
plugin that returns text without preserving the source recording is
insufficient.

### Local Persistence

The device is the immediate source of truth while Ivan is working:

-   the current native repository atomically stores a versioned JSON envelope
    containing the journal snapshot, checkpoint and pending operation log in
    protected Application Support storage
-   original audio and photographs are stored as native files referenced by
    stable asset IDs
-   drawing operations are committed locally at stroke boundaries
-   derived thumbnails and transcripts may be regenerated without modifying
    original assets
-   each mutation has an idempotent operation ID and document revision
-   acknowledged edits survive force-close, crash and temporary network loss

SQLite was a prior design direction and remains only a possible future
replacement; it is not the current native persistence backend.

### Backend

The current backend direction is Apple iCloud/CloudKit backup and recovery,
which supersedes the earlier Supabase proposal. Local durability remains the
authority for whether the current edit is safe. Multi-device conflict behavior
is unresolved and must not silently discard or overwrite edits. See
[ADR 0004](../docs/adr/0004-cloudkit-icloud-backup-and-recovery.md) and
[ADR 0007](../docs/adr/0007-multi-device-conflict-policy.md).

### Development Requirements

-   React UI, TypeScript contracts and browser-based tests may begin on Windows.
-   A Mac with Xcode is required before the oldest-iPad drawing gate and before
    any Swift audio, transcription, file or lifecycle plugin work.
-   Capacitor 8 requires Xcode 26 or later. Use a Universal Xcode 26 build on
    an Intel Mac.
-   Xcode 26.0 through 26.3 can run on macOS Sequoia 15.6. Later Xcode 26 point
    releases may require macOS Tahoe 26.2.
-   Official macOS Tahoe support includes the Intel MacBook Pro 16-inch 2019
    and the Intel MacBook Pro 13-inch 2020 with four Thunderbolt 3 ports.
    The available development machine is confirmed as a **MacBook Pro
    16-inch 2019**, so it can run macOS Tahoe 26 and the Universal Intel build
    of Xcode 26.
-   A free Apple ID is sufficient for early development-device installation
    and the drawing/audio prototypes, subject to temporary-signing limits.
-   Apple Developer Program membership is not required to start. Enrol before
    external TestFlight testing, App Store distribution or long-lived beta
    installation for Ivan and helpers.
-   The Intel Mac is an MVP toolchain, not a long-term assumption: Xcode 27 is
    Apple-silicon-only, so future App Store maintenance will require an
    Apple-silicon Mac or compatible hosted build service.
-   Physical iPad testing is mandatory for the current release; simulators
    cannot validate Pencil, palm, microphone or interruption behaviour.
    Physical iPhone testing will be required when iPhone work enters scope.

### Version Control and Repository

-   The canonical source repository is
    `https://github.com/benresonance-star/IvanDiary`.
-   `My Journal` is an isolated Git repository. Its repository root must be the
    application directory, never the developer's Windows or macOS home folder.
-   Use `main` as the protected primary branch. Day-to-day features and fixes
    should use short-lived branches and focused pull requests once collaborative
    development begins.
-   Commit source, tests, specifications, migrations, lockfiles and required
    project configuration. Do not commit `node_modules`, build output, editor
    state, local databases, generated recordings/photos, signing material,
    credentials or environment secrets.
-   Keep `.env` files local and provide documented example variables without
    real keys if services requiring them are introduced.
-   Before merging or pushing release-ready changes, run type checking, lint,
    automated tests and a production build. Native changes additionally require
    the applicable Xcode build and physical-device checks.
-   Use readable commit messages that describe the product outcome. Tag tested
    release candidates and production releases so a known-good version can be
    recovered.
-   Git and GitHub protect source history; they are not a backup or sync
    mechanism for Ivan's private journal content.

------------------------------------------------------------------------

## 15. Core Data Model

Primary entities:

``` text
User
Journal
JournalDay
Page
Sketchbook
PageObject
DrawingStroke
VoiceRecording
Transcript
Photo
TextBlock
LinkBlock
Favourite
DocumentOperation
PaperStyle
```

### Page

A Page contains a paper background, a drawing layer and constrained free-form
page objects. Page objects have stable IDs, type, position, creation order and
revision. Voice, transcript, photo, text and link objects receive automatic
initial positions and remain movable without exposing a general-purpose page
layout system.

### PageObject

The MVP page-object types are:

-   voice player
-   transcript/text block
-   photograph
-   pasted link

Drawing strokes belong to the page drawing layer rather than being individually
selectable page objects in the normal interface.

### VoiceRecording

Store at minimum:

-   ID
-   page ID
-   audio storage URL
-   creation time
-   session/replay start time
-   duration
-   page position
-   transcription status
-   local durability state
-   remote sync state
-   file checksum and format metadata

### Transcript

Store separately from the recording:

-   recording ID
-   raw Apple transcript
-   edited transcript
-   timestamps where available
-   transcription engine and locale
-   transcript status and error without modifying the recording

The raw transcript is immutable after it is stored. Corrections create or
update the edited transcript.

### DrawingStroke

Store at minimum:

-   ID
-   page ID
-   points
-   pressure
-   tilt
-   brush/tool
-   width
-   colour
-   timestamps
-   stroke order
-   schema version

### LinkBlock

Store at minimum:

-   ID and page ID
-   original pasted URL
-   user-visible title
-   optional preview image and description
-   creation time and page position

Failure to fetch preview metadata must not prevent saving or opening the link.

### DocumentOperation

Every mutation that can affect recovery or synchronization stores:

-   operation ID
-   document/page ID
-   operation type
-   payload schema version
-   base and resulting revision
-   device-local creation time
-   local commit status
-   remote sync status

Operations must be idempotent so interrupted synchronization can safely retry.

------------------------------------------------------------------------

## 16. Autosave and Reliability

The application is a personal memory archive, so data loss is
unacceptable.

Requirements:

-   continuous local save while working
-   background backup and recovery through iCloud/CloudKit
-   tolerate temporary network loss
-   never discard an audio recording because transcription or upload
    fails
-   show simple, unobtrusive sync status
-   recover unfinished sessions after app, operating-system or device
    interruption
-   retain original media separately from derived data
-   request persistent device storage where available
-   detect and clearly handle low-storage and quota failures
-   maintain recoverable deletion or trash rather than immediate permanent
    deletion

Save-state semantics:

-   **Recording** means audio is actively being written to a local file.
-   **Saved on this iPad** means all acknowledged mutations are durably
    committed locally.
-   **Syncing** means local content is safe and remote backup is pending.
-   **Synced** means the current local revision is confirmed remotely.
-   **Needs attention** means local content remains safe but synchronization
    or storage requires helper action.

The interface must never show **Saved on this iPad** solely because a React
state update completed.

------------------------------------------------------------------------

## 17. Accessibility and Simple Mode

Accessibility is part of the base product rather than a later theme.

Requirements:

-   primary controls at least 56 points
-   every interactive target at least 44 by 44 points
-   adjustable text and control scale
-   readable clean-print default typography
-   light, dark and high-contrast paper/interface combinations
-   VoiceOver names, states and logical reading order
-   no status communicated by colour alone
-   reduced-motion support
-   forgiving drag thresholds and generous hit areas
-   confirmation or an undo window for destructive actions
-   no required precision gestures
-   keep helper and advanced settings out of the primary workflow

The primary interface exposes Diary, Sketchbooks and Settings navigation;
Draw, Erase, Photo, Text, Voice and Undo in the workspace; and direct playback
of saved recordings. Large pen-width presets remain available, while precision
nudge and size shortcut buttons stay hidden.

------------------------------------------------------------------------

## 18. MVP Scope

### Journal

-   automatically create/open today's journal
-   multiple pages per day
-   browse previous days
-   visual journal thumbnails

### Drawing

-   Draw with the default fine black pen
-   Erase
-   undo / redo
-   Apple Pencil pressure
-   tilt capture where available
-   finger input
-   timestamped stroke storage
-   versioned vector source and generated thumbnail

### Voice

-   record original audio
-   preserve recording
-   Apple speech transcription
-   audio playback
-   transcript editing
-   multiple recordings per page

### Media

-   add photographs that can cover the 16:9 page
-   keep photograph proportions in Edit mode unless turned off
-   paste and open web links from View mode
-   tappable web links in a shared PDF

### Appearance

-   warm real-paper backgrounds
-   small paper-style library
-   handwritten text font options
-   basic font size/contrast controls
-   Interface V2 simplified navigation and toolbar

### Sketchbooks

-   create sketchbook
-   create pages
-   draw
-   speak/record
-   add photographs

### Persistence

-   automatic local save
-   iCloud/CloudKit backup and recovery
-   recovery after interruption
-   durable native audio files
-   atomic Application Support JSON envelope for metadata and operation log
-   separate local-save and remote-sync status

### Favourites

-   mark and unmark journal days and pages
-   mark and unmark sketchbook pages
-   browse a simple visual favourites filter

------------------------------------------------------------------------

## 19. Explicitly Out of MVP

Do not include in the initial build:

-   music integration
-   AI story generation
-   AI reflection
-   semantic memory graph
-   drawing/voice synchronized Replay Memory
-   automated autobiography
-   complex AI chat
-   large brush libraries
-   advanced page layout/design tools
-   exposed layers, arbitrary z-ordering and precision transforms
-   People, Places and Tags navigation
-   advanced or semantic search
-   social features

The data model should avoid blocking these future capabilities, but they
should not complicate the first version.

------------------------------------------------------------------------

## 20. Definition of Done

The MVP is successful when Ivan can:

1.  Open the app on iPad.
2.  Arrive at today's journal with minimal navigation.
3.  Draw naturally with Apple Pencil or finger.
4.  Record himself speaking without leaving the page.
5.  Have the original recording saved permanently.
6.  Explicitly choose **Convert to text** and see an Apple-generated transcript
    without being required to edit it. The current missing voice-card action
    must be resolved before this criterion is met.
7.  Add another page or photograph.
8.  Close the app without manually saving.
9.  Return later and see the page exactly as he left it.
10. Play his original voice recording.
11. Browse previous days visually using his own drawings.
12. Create and use a separate sketchbook.
13. Paste a link and reopen it later.
14. Mark and revisit a favourite day or sketch.
15. Use the full native iPad keyboard or Apple keyboard dictation when text
    entry is requested.
16. Distinguish **Saved on this iPad** from remote synchronization without
    needing to understand technical details.
17. Recover acknowledged work after a forced app close or temporary network
    loss.

The MVP is not complete until the oldest supported iPad passes the Pencil,
palm/finger, audio interruption, local durability, accessibility and
large-document acceptance tests.
