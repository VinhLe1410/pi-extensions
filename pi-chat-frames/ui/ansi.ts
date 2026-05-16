export const OSC133_ZONE_START = "\x1b]133;A\x07";
export const OSC133_ZONE_END = "\x1b]133;B\x07";
export const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const BACKGROUND_ANSI_PATTERN = /\x1b\[(?:49|48;5;\d+|48;2;\d+;\d+;\d+)m/g;
const TRAILING_ANSI_PATTERN = /(?:\x1b\[[0-9;]*m)+$/;

export interface OscStripResult {
  line: string;
  start: boolean;
  end: boolean;
}

export function stripOscMarkers(line: string): OscStripResult {
  let next = line;
  const start = next.includes(OSC133_ZONE_START);
  const end = next.includes(OSC133_ZONE_END) || next.includes(OSC133_ZONE_FINAL);
  next = next
    .replaceAll(OSC133_ZONE_START, "")
    .replaceAll(OSC133_ZONE_END, "")
    .replaceAll(OSC133_ZONE_FINAL, "");
  return { line: next, start, end };
}

export function stripAnsi(line: string): string {
  return line.replace(ANSI_PATTERN, "");
}

export function stripBackgroundAnsi(line: string): string {
  return line.replace(BACKGROUND_ANSI_PATTERN, "");
}

export function insertBeforeTrailingAnsi(line: string, text: string): string {
  if (!text) return line;
  const match = TRAILING_ANSI_PATTERN.exec(line);
  if (!match || match.index === undefined) return line + text;
  return line.slice(0, match.index) + text + line.slice(match.index);
}
