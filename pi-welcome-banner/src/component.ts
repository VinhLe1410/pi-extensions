import { type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { FIELD_HEIGHT, FIELD_WIDTH, MIN_BANNER_WIDTH, TARGETS, type PiToken } from "./glyph.ts";
import {
  ASSEMBLE_FRAMES,
  FRAME_MS,
  createParticles,
  getParticlePosition,
  getParticleProgress,
  type Particle,
} from "./particles.ts";

const CELL_WIDTH = 2;
const RESERVED_ROWS = 8;
const MIN_TOP_PADDING = 2;

export { MIN_BANNER_WIDTH } from "./glyph.ts";

type BannerOptions = {
  expanded: boolean;
};

type StyledGlyph = {
  text: string;
  color: ThemeColor;
  bold?: boolean;
  rank: number;
};

export class WelcomeBannerComponent implements Component {
  private expanded: boolean;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private cachedWidth = -1;
  private cachedRows = -1;
  private cachedFrame = -1;
  private cachedExpanded = false;
  private cachedLines: string[] = [];
  private readonly particles = createParticles(TARGETS);

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    options: BannerOptions,
  ) {
    this.expanded = options.expanded;
    if (this.expanded) this.startTimer();
  }

  replay(): void {
    if (this.tui.terminal.columns < MIN_BANNER_WIDTH) return;

    this.expanded = true;
    this.frame = 0;
    this.stopTimer();
    this.startTimer();
    this.bump();
  }

  collapse(): void {
    if (!this.expanded) return;

    this.expanded = false;
    this.stopTimer();
    this.bump();
  }

  dispose(): void {
    this.stopTimer();
  }

  invalidate(): void {
    this.cachedWidth = -1;
    this.cachedRows = -1;
    this.cachedFrame = -1;
  }

  render(width: number): string[] {
    const rows = this.tui.terminal.rows;
    if (
      this.cachedWidth === width &&
      this.cachedRows === rows &&
      this.cachedFrame === this.frame &&
      this.cachedExpanded === this.expanded
    ) {
      return this.cachedLines;
    }

    const lines = this.expanded && width >= MIN_BANNER_WIDTH ? this.renderExpanded(width, rows) : [];

    this.cachedLines = lines.map((line) => fit(line, width));
    this.cachedWidth = width;
    this.cachedRows = rows;
    this.cachedFrame = this.frame;
    this.cachedExpanded = this.expanded;
    return this.cachedLines;
  }

  private renderExpanded(width: number, rows: number): string[] {
    const field = this.renderParticleField(width, rows);
    const topPadding = Math.max(
      MIN_TOP_PADDING,
      Math.floor((rows - RESERVED_ROWS - field.length) / 2),
    );

    return [
      ...Array.from({ length: topPadding }, () => ""),
      ...field,
      "",
    ];
  }

  private renderParticleField(width: number, rows: number): string[] {
    const scale = getFieldScale(width, rows);
    const cells = this.buildCells(scale);
    const fieldWidth = getScaledFieldWidth(scale, width);
    const fieldHeight = Math.max(1, Math.ceil(FIELD_HEIGHT * scale));
    const left = Math.floor((FIELD_WIDTH - fieldWidth) / 2);
    const top = Math.floor((FIELD_HEIGHT - fieldHeight) / 2);

    return Array.from({ length: fieldHeight }, (_, rowIndex) => {
      const y = rowIndex + top;
      const line = Array.from({ length: fieldWidth }, (_, columnIndex) => {
        const x = columnIndex + left;
        const cell = cells.get(pointKey(x, y));
        return cell ? `${this.styled(cell)} ` : "  ";
      }).join("");

      return centerLine(line, width);
    });
  }

  private buildCells(scale: number): Map<string, StyledGlyph> {
    const cells = new Map<string, StyledGlyph>();

    for (const particle of this.particles) {
      const progress = getParticleProgress(this.frame, particle);
      const { x, y } = getParticlePosition(particle, progress, scale);
      this.setCell(cells, x, y, this.particleGlyph(progress, particle));
    }

    return cells;
  }

  private particleGlyph(progress: number, particle: Particle): StyledGlyph {
    if (progress >= 0.94) return finalGlyph(particle.token);

    if (progress >= 0.68) {
      return particle.token === "#"
        ? { text: "●", color: "accent", bold: true, rank: 30 }
        : { text: "•", color: "accent", bold: true, rank: 28 };
    }

    if (progress >= 0.28) {
      return { text: "•", color: "muted", rank: 20 };
    }

    return { text: "·", color: "dim", rank: 10 };
  }

  private setCell(cells: Map<string, StyledGlyph>, x: number, y: number, glyph: StyledGlyph): void {
    if (x < 0 || x >= FIELD_WIDTH || y < 0 || y >= FIELD_HEIGHT) return;

    const key = pointKey(x, y);
    const existing = cells.get(key);
    if (!existing || glyph.rank >= existing.rank) cells.set(key, glyph);
  }

  private styled(glyph: StyledGlyph): string {
    const text = this.theme.fg(glyph.color, glyph.text);
    return glyph.bold ? this.theme.bold(text) : text;
  }

  private startTimer(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.frame += 1;
      if (this.frame >= ASSEMBLE_FRAMES) {
        this.frame = ASSEMBLE_FRAMES;
        this.stopTimer();
      }
      this.bump();
    }, FRAME_MS);
  }

  private stopTimer(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = undefined;
  }

  private bump(): void {
    this.invalidate();
    this.tui.requestRender();
  }
}

function finalGlyph(token: PiToken): StyledGlyph {
  if (token === "#") return { text: "●", color: "accent", bold: true, rank: 40 };
  if (token === "m") return { text: "•", color: "accent", bold: true, rank: 36 };
  return { text: "·", color: "accent", rank: 32 };
}

function getFieldScale(width: number, rows: number): number {
  const maxCellsByWidth = Math.floor(width / CELL_WIDTH);
  const widthScale = maxCellsByWidth / FIELD_WIDTH;
  const availableRows = Math.max(1, rows - RESERVED_ROWS - MIN_TOP_PADDING);
  const heightScale = availableRows / FIELD_HEIGHT;

  return Math.min(1, widthScale, heightScale);
}

function getScaledFieldWidth(scale: number, width: number): number {
  return Math.max(1, Math.min(Math.floor(width / CELL_WIDTH), Math.ceil(FIELD_WIDTH * scale)));
}

function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

function fit(line: string, width: number): string {
  if (width <= 0) return "";
  return truncateToWidth(line, width, "");
}

function centerLine(line: string, width: number): string {
  const fitted = fit(line, width);
  const padding = Math.max(0, Math.floor((width - visibleWidth(fitted)) / 2));
  return `${" ".repeat(padding)}${fitted}`;
}
