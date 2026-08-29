export function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function moveItem(
  itemIds: string[],
  sourceId: string,
  targetId: string,
): string[] {
  const sourceIndex = itemIds.indexOf(sourceId);
  const targetIndex = itemIds.indexOf(targetId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return itemIds;
  }
  const reordered = [...itemIds];
  reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, sourceId);
  return reordered;
}
