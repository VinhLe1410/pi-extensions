import type { Theme } from "@earendil-works/pi-coding-agent";
import { FALLBACK_ACCENT, NON_ZERO_LEVELS } from "./constants.ts";
import type { DayTotals } from "./types.ts";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): Rgb | undefined {
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return undefined;
  const value = match[1]!;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: lightness * 100 };

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

  return { h: hue * 60, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = h / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue >= 0 && hue < 1) [red, green, blue] = [chroma, x, 0];
  else if (hue < 2) [red, green, blue] = [x, chroma, 0];
  else if (hue < 3) [red, green, blue] = [0, chroma, x];
  else if (hue < 4) [red, green, blue] = [0, x, chroma];
  else if (hue < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function parseThemeAccent(theme: Theme): Rgb {
  const trueColorMatch = theme
    .getFgAnsi("accent")
    .match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  if (trueColorMatch) {
    return {
      r: Number(trueColorMatch[1]),
      g: Number(trueColorMatch[2]),
      b: Number(trueColorMatch[3]),
    };
  }

  return hexToRgb(FALLBACK_ACCENT)!;
}

function colorCell(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[39m`;
}

export function makeLevelStyles(theme: Theme): Array<(text: string) => string> {
  const accent = rgbToHsl(parseThemeAccent(theme));
  const styles: Array<(text: string) => string> = [
    (text) => theme.fg("dim", text),
  ];

  for (let level = 1; level <= NON_ZERO_LEVELS; level++) {
    const progress = level / NON_ZERO_LEVELS;
    const rgb = hslToRgb({
      h: accent.h,
      s: clamp(accent.s * (0.38 + progress * 0.62), 25, 96),
      l: clamp(20 + progress * 40 + (accent.l - 50) * 0.15, 18, 72),
    });
    styles.push((text, color = rgb) => colorCell(color, text));
  }

  return styles;
}

function upperBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (values[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createLevelResolver(days: DayTotals): (value: number) => number {
  const values = Array.from(days.values())
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return () => 0;

  return (value) => {
    if (value <= 0) return 0;
    return clamp(
      Math.ceil((upperBound(values, value) / values.length) * NON_ZERO_LEVELS),
      1,
      NON_ZERO_LEVELS,
    );
  };
}
