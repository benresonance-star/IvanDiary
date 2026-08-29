export const DEFAULT_FAVOURITE_PEN_COLOURS = [
  "#171410",
  "#245b8a",
  "#426b3a",
  "#9b352f",
  "#6b4f82",
  "#76512f",
  "#c86f24",
  "#2f6f6d",
  "#a64b6b",
  "#686868",
] as const;

const DEFAULT_COLOUR_NAMES = [
  "Black", "Blue", "Green", "Red", "Purple",
  "Brown", "Orange", "Teal", "Rose", "Grey",
] as const;

export function favouriteColourName(index: number): string {
  return DEFAULT_COLOUR_NAMES[index] ?? `Favourite colour ${index + 1}`;
}
