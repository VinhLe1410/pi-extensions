export const PI_MASK = [
  "..........................",
  "..sm###################ms.",
  ".sm#####################ms",
  "..sm###################ms.",
  "......m###m.....m###m.....",
  "......####......####......",
  "......####......####......",
  ".....m###.......####......",
  ".....####.......####......",
  "....m###........####......",
  "....####........####......",
  "...m###.........####......",
  "..m###..........####......",
  "..####..........####......",
  "..m###..........####......",
  "..###m..........m###......",
  "...mm............mm.......",
] as const;

export type PiToken = "#" | "m" | "s";

export type Target = {
  x: number;
  y: number;
  token: PiToken;
};

export const FIELD_WIDTH = 37;
export const FIELD_HEIGHT = 21;
export const CENTER_X = (FIELD_WIDTH - 1) / 2;
export const CENTER_Y = (FIELD_HEIGHT - 1) / 2;

export const PI_WIDTH = PI_MASK[0].length;
export const PI_HEIGHT = PI_MASK.length;
export const MIN_BANNER_WIDTH = PI_WIDTH * 2;

const PI_LEFT = Math.floor((FIELD_WIDTH - PI_WIDTH) / 2);
const PI_TOP = Math.floor((FIELD_HEIGHT - PI_HEIGHT) / 2) + 1;

export const TARGETS = buildTargets();

export function isPiToken(token: string): token is PiToken {
  return token === "#" || token === "m" || token === "s";
}

function buildTargets(): Target[] {
  const targets: Target[] = [];

  PI_MASK.forEach((row, rowIndex) => {
    Array.from(row).forEach((token, columnIndex) => {
      if (isPiToken(token)) {
        targets.push({ x: PI_LEFT + columnIndex, y: PI_TOP + rowIndex, token });
      }
    });
  });

  return targets;
}
