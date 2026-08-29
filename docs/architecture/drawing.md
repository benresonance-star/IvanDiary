# Drawing

## Current implementation

On native iPad, `useNativeDrawingOverlay` and `PencilKitPlugin` place `NativeDrawingViewController` over the React paper. The controller uses `PKCanvasView` and saves/loads `PKDrawing` data identified by the page or Story `drawingDocumentId`. That `.pkdrawing` content is the editable authority. `getPreview`, `PencilKitPreview.previewUri`, thumbnails and share renderings are derivatives and must not replace it.

`PencilKitPlugin.showOverlay`/`updateOverlay` carries tool, nib, colour, width, opacity, finger drawing, two-finger undo, grid geometry and overlay shapes. React coordinates visibility so dialogs/navigation stay above the native surface. Browser drawing and legacy ink paths are fallbacks/migration inputs, not authority for a native drawing after import.

## Evidence and constraints

- `NativeDrawingGesturePolicyTests.swift`: Apple Pencil is reserved for drawing and drawing does not wait for content gestures.
- `useNativeDrawingOverlay.test.ts`: overlay coordination.
- `NativeSketchPreview.test.tsx`: derived native previews.
- `operations.test.ts`: durable per-page grid settings.
- `gridGeometry.test.ts` and `drawingOverlayLayout.test.ts`: guide geometry/layout.

Finger drawing must remain available; Pencil cannot be required for core interaction. Semantic controls and keyboard-accessible starters must coexist with direct drawing. Physical tests are still required for Pencil latency, palm rejection, finger behavior, two-finger undo, overlay stacking, rotation, force-close recovery and first-generation iPad Pro. No physical pass is claimed.

## Target state

Keep PencilKit persistence and gesture policy inside the testable Apple drawing package and keep React responsible for product orchestration. Any change to authoritative drawing format, file lifecycle or bridge contract requires explicit approval.
