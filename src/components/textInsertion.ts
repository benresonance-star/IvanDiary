export type TextSelection = { start: number; end: number };

export function insertSpokenText(
  text: string,
  spokenText: string,
  selection: TextSelection,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const spoken = spokenText.trim();
  const before = text.slice(0, start);
  const after = text.slice(end);
  const leftGap = before && !/\s$/.test(before) ? " " : "";
  const rightGap = after && !/^[\s.,!?;:)]/.test(after) ? " " : "";
  const inserted = `${leftGap}${spoken}${rightGap}`;
  return {
    text: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length,
  };
}
