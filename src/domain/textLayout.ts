import type { Page, PageTextStack, Position, Size, TextObject } from "./models";

export type TextLayout = {
  position: Position;
  frame: Size;
};

export const DEFAULT_TEXT_FRAME: Size = { width: 0.42, height: 0.24 };
export const TEXT_DOCK_MARGIN = 0.02;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function displayedTextLayout(
  text: Pick<TextObject, "position" | "frame">,
): TextLayout {
  const frame = text.frame ?? DEFAULT_TEXT_FRAME;
  const position = {
    x: clamp(text.position.x, 0, 1 - frame.width),
    y: clamp(text.position.y, 0, 1 - frame.height),
  };
  return { position, frame };
}

function displayedLegacyStackLayout(stack: PageTextStack): TextLayout {
  if (!stack.dock || stack.dock === "free") {
    return { position: stack.position, frame: stack.frame };
  }
  const width = clamp(stack.frame.width, 0.3, 0.7);
  return {
    position: {
      x: stack.dock === "left" ? TEXT_DOCK_MARGIN : 1 - TEXT_DOCK_MARGIN - width,
      y: 0.04,
    },
    frame: { width, height: 0.92 },
  };
}

export function materializeLegacyTextStack(
  page: Page,
  removeStack: boolean,
): Page {
  const stack = page.textStack;
  if (!stack) return page;
  const memberIds = stack.memberIds.filter((id, index, ids) =>
    ids.indexOf(id) === index &&
    page.objects.some((object) => object.id === id && object.type === "text"));
  const layout = displayedLegacyStackLayout(stack);
  const gap = memberIds.length > 1
    ? Math.min(0.02, layout.frame.height / (memberIds.length * 4))
    : 0;
  const slotHeight = memberIds.length > 0
    ? Math.max(0.01, (layout.frame.height - gap * (memberIds.length - 1)) / memberIds.length)
    : layout.frame.height;
  const memberIndex = new Map(memberIds.map((id, index) => [id, index]));
  const objects = page.objects.map((object) => {
    if (object.type !== "text") return object;
    const index = memberIndex.get(object.id);
    if (index === undefined) return object;
    const height = Math.min(object.frame?.height ?? DEFAULT_TEXT_FRAME.height, slotHeight);
    return {
      ...object,
      position: {
        x: layout.position.x,
        y: clamp(
          layout.position.y + index * (slotHeight + gap),
          0,
          1 - height,
        ),
      },
      frame: { width: layout.frame.width, height },
    };
  });
  if (!removeStack) return { ...page, objects };
  const { textStack: _textStack, ...withoutStack } = page;
  void _textStack;
  return { ...withoutStack, objects };
}
