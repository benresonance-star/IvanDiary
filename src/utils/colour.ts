export type HslColour = {
  h: number;
  s: number;
  l: number;
};

const HEX_RGB = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_RGB.test(value);
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = HEX_RGB.exec(hex.trim());
  if (!match?.[1]) {
    return { r: 23, g: 20, b: 16 };
  }
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function hexToHsl(hex: string): HslColour {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }
  return {
    h: (hue / 6) * 360,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tone = t;
  if (tone < 0) {
    tone += 1;
  }
  if (tone > 1) {
    tone -= 1;
  }
  if (tone < 1 / 6) {
    return p + (q - p) * 6 * tone;
  }
  if (tone < 1 / 2) {
    return q;
  }
  if (tone < 2 / 3) {
    return p + (q - p) * (2 / 3 - tone) * 6;
  }
  return p;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;
  if (saturation === 0) {
    const grey = lightness * 255;
    return rgbToHex(grey, grey, grey);
  }
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return rgbToHex(
    hueToRgb(p, q, hue + 1 / 3) * 255,
    hueToRgb(p, q, hue) * 255,
    hueToRgb(p, q, hue - 1 / 3) * 255,
  );
}

export function colourWithOpacity(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(isHexColor(hex) ? hex : "#171410");
  return `rgba(${r}, ${g}, ${b}, ${clampOpacity(opacity)})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * linear[0]! +
    0.7152 * linear[1]! +
    0.0722 * linear[2]!
  );
}

export function colourContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColour(
  requested: string,
  background: string,
): string {
  if (colourContrastRatio(requested, background) >= 4.5) {
    return requested;
  }
  return colourContrastRatio("#000000", background) >=
    colourContrastRatio("#ffffff", background)
    ? "#000000"
    : "#ffffff";
}
