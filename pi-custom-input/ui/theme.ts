import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

export const SEPARATOR = " • ";
export const RESET_ICON = "";

export function separator(theme: Theme): string {
  return theme.fg("dim", SEPARATOR);
}

export function percentColor(percent: number): ThemeColor {
  if (percent >= 85) return "error";
  if (percent >= 60) return "warning";
  return "success";
}

export function contextColor(percent: number): ThemeColor {
  if (percent >= 60) return "error";
  if (percent >= 40) return "warning";
  return "success";
}

export function thinkingColor(thinkingLevel: string): ThemeColor {
  switch (thinkingLevel) {
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    default:
      return "thinkingOff";
  }
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const THINKING_BACKGROUND_TINT = 0.1;
const CUBE_VALUES = [0, 95, 135, 175, 215, 255] as const;
const ANSI_16_COLORS: readonly Rgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 0, b: 0 },
  { r: 0, g: 128, b: 0 },
  { r: 128, g: 128, b: 0 },
  { r: 0, g: 0, b: 128 },
  { r: 128, g: 0, b: 128 },
  { r: 0, g: 128, b: 128 },
  { r: 192, g: 192, b: 192 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
];

function parseAnsiRgb(ansi: string): Rgb | null {
  const rgbMatch = ansi.match(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  const indexedMatch = ansi.match(/\x1b\[(?:38|48);5;(\d+)m/);
  return indexedMatch ? xterm256ToRgb(Number(indexedMatch[1])) : null;
}

function xterm256ToRgb(index: number): Rgb | null {
  if (!Number.isInteger(index) || index < 0 || index > 255) return null;
  if (index < 16) return ANSI_16_COLORS[index] ?? null;
  if (index >= 232) {
    const value = 8 + (index - 232) * 10;
    return { r: value, g: value, b: value };
  }

  const cubeIndex = index - 16;
  const r = CUBE_VALUES[Math.floor(cubeIndex / 36)] ?? 0;
  const g = CUBE_VALUES[Math.floor((cubeIndex % 36) / 6)] ?? 0;
  const b = CUBE_VALUES[cubeIndex % 6] ?? 0;
  return { r, g, b };
}

function rgbTo256({ r, g, b }: Rgb): number {
  const nearest = (value: number) => Math.round((value / 255) * 5);
  return 16 + 36 * nearest(r) + 6 * nearest(g) + nearest(b);
}

function blendRgb(base: Rgb, tint: Rgb, amount: number): Rgb {
  return {
    r: Math.round(base.r + (tint.r - base.r) * amount),
    g: Math.round(base.g + (tint.g - base.g) * amount),
    b: Math.round(base.b + (tint.b - base.b) * amount),
  };
}

function backgroundAnsi(theme: Theme, rgb: Rgb): string {
  if (theme.getColorMode() === "256color") {
    return `\x1b[48;5;${rgbTo256(rgb)}m`;
  }
  return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

export function thinkingBackgroundAnsi(
  theme: Theme,
  thinkingLevel: string,
): string | null {
  const base = parseAnsiRgb(theme.getBgAnsi("userMessageBg"));
  const tint = parseAnsiRgb(theme.getFgAnsi(thinkingColor(thinkingLevel)));
  if (!base || !tint) return null;

  return backgroundAnsi(theme, blendRgb(base, tint, THINKING_BACKGROUND_TINT));
}
