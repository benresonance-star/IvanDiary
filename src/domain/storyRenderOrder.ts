import type { MyStoryPage, MyStoryRenderItemRef } from "./models";

export function storyRenderItems(page: MyStoryPage): MyStoryRenderItemRef[] {
  return [
    ...page.textBlocks.map(({ id }) => ({ kind: "text" as const, id })),
    ...page.links.map(({ id }) => ({ kind: "link" as const, id })),
    ...page.photos.map(({ id }) => ({ kind: "photo" as const, id })),
    ...page.recordings.map(({ id }) => ({ kind: "recording" as const, id })),
    ...(page.shapes ?? []).map(({ id }) => ({ kind: "shape" as const, id })),
  ];
}

export function renderItemKey(item: MyStoryRenderItemRef): string {
  return `${item.kind}:${item.id}`;
}

export function normalizedStoryRenderOrder(page: MyStoryPage): MyStoryRenderItemRef[] {
  const available = storyRenderItems(page);
  const byKey = new Map(available.map((item) => [renderItemKey(item), item]));
  const seen = new Set<string>();
  const ordered: MyStoryRenderItemRef[] = [];
  for (const item of page.renderOrder ?? []) {
    const key = renderItemKey(item);
    const valid = byKey.get(key);
    if (valid && !seen.has(key)) {
      seen.add(key);
      ordered.push(valid);
    }
  }
  for (const item of available) {
    const key = renderItemKey(item);
    if (!seen.has(key)) ordered.push(item);
  }
  return ordered;
}

export function storyStackIndex(page: MyStoryPage, kind: MyStoryRenderItemRef["kind"], id: string): number {
  return normalizedStoryRenderOrder(page).findIndex((item) => item.kind === kind && item.id === id);
}
