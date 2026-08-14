# Physical iPad acceptance gate

Complete this checklist on the oldest supported iPadOS version and the current
iPadOS release before a production build.

## Accessibility and input

- [ ] VoiceOver announces every toolbar control, dialog, status change, page
      preview, voice recording control, and destructive confirmation.
- [ ] Switch Control can reach and activate navigation, drawing tools, page
      controls, playback, Convert to text, and Settings without a precision
      gesture.
- [ ] Standard, Large, and Extra Large text do not clip primary actions.
- [ ] High Contrast preserves readable text, focus rings, and selected states.
- [ ] Keyboard mode opens the alphabetic iPad keyboard after switching from
      Voice mode; caret and selection are preserved.
- [ ] Floating or split keyboard preferences do not obscure Add to canvas.

## Drawing durability

- [ ] PencilKit strokes survive tool changes, navigation, app backgrounding,
      force-close, and relaunch.
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
