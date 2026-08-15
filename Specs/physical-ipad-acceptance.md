# Physical iPad acceptance gate

Complete this checklist on the oldest supported iPadOS version and the current
iPadOS release before a production build.

## Accessibility and input

- [ ] VoiceOver announces every toolbar control, Share picture/PDF choices,
      Favourite after the today/earlier label, dialog, status change, page preview, voice
      recording control, and destructive confirmation.
- [ ] Switch Control can reach and activate navigation, drawing tools, Share,
      header Favourite, page controls, playback, Convert to text, and Settings
      without a precision gesture.
- [ ] Standard, Large, and Extra Large text do not clip primary actions.
- [ ] High Contrast preserves readable text, focus rings, and selected states.
- [ ] Draw settings fit without scrolling in standard iPad portrait and
      landscape layouts; Pen/Grid tabs, nibs, switches, colour controls, and
      Straighten remain at least 48pt and are announced with their state.
- [ ] Slider thumbs stay centred on their tracks at minimum, midpoint, and
      maximum values.
- [ ] Keyboard mode opens the alphabetic iPad keyboard after switching from
      Voice mode; caret and selection are preserved.
- [ ] Floating or split keyboard preferences do not obscure Add to canvas.
- [ ] In View mode, tapping a pasted web link on the page opens it in Safari.
- [ ] A shared PDF opens pasted web links from the page cards or the Web links page.

## Drawing durability

- [ ] PencilKit strokes survive tool changes, navigation, app backgrounding,
      force-close, and relaunch.
- [ ] Line and dot grids remain visible and aligned with snapping at Small,
      Medium, and Large sizes, including rotated grids and custom colours.
- [ ] Each diary and sketchbook page restores its own grid enabled state,
      size, type, colour, and rotation after force-close and relaunch.
- [ ] Two-finger tap undoes once without leaving an accidental mark.
- [ ] Navigation, link, text, and confirmation overlays always appear above
      PencilKit and restore drawing afterward.
- [ ] Deleting a page or sketchbook removes its native drawing files.

## Audio and transcription

- [ ] An interrupted recording can be recovered and played.
- [ ] A saved Voice recording does not transcribe until Convert to text is
      selected.
- [ ] Speech permission denial and transcription failure preserve the original
      recording and offer a large retry action.
- [ ] Temporary recordings used for names and text are removed after success
      and failure.

## Storage and backup

- [ ] Low-storage warnings appear before a recording or asset write can fail.
- [ ] Wi-Fi-only backup waits on cellular and resumes after Wi-Fi reconnects.
- [ ] iCloud round trip restores text, photos, audio, drawings, My Words audio,
      favourites, settings, and a legacy-schema snapshot.
- [ ] A missing or corrupt cloud asset leaves the current local diary unchanged.
- [ ] Backgrounding during a save produces no missing journal operations or
      partial drawing files.
