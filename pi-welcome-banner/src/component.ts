import { type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { CENTER_X, CENTER_Y, FIELD_HEIGHT, FIELD_WIDTH, MIN_BANNER_WIDTH, TARGETS, type PiToken } from "./glyph.ts";
import {
  AMBIENT_FRAME_MS,
  ASSEMBLE_FRAME_MS,
  ASSEMBLE_FRAMES,
  createParticles,
  DISPERSE_FRAME_MS,
  DISPERSAL_FRAMES,
  getAssemblePosition,
  getDispersePosition,
  getParticleProgress,
  type Particle,
  type Phase,
  scalePoint,
} from "./particles.ts";

const CELL_WIDTH = 2;
const RESERVED_ROWS = 8;
const MIN_TOP_PADDING = 2;

export { MIN_BANNER_WIDTH } from "./glyph.ts";

type StyledGlyph = {
  text: string;
  color: ThemeColor;
  bold?: boolean;
  rank: number;
};

type ScaledBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type RenderMetrics = {
  scale: number;
  bounds: ScaledBounds;
  fieldWidth: number;
  topPadding: number;
};

/**
 * Normal header banner. It deliberately avoids TUI overlays because visible
 * overlays disable pi-input-3000's sticky input compositor.
 */
export class WelcomeBannerComponent implements Component {
  private frame = 0;
  private visible = true;
  private dispersing = false;
  private disperseFrame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private intervalMs = 0;
  private readonly particles = createParticles(TARGETS);
  private collapseResolvers: Array<() => void> = [];

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
  ) {
    this.startTimer();
  }

  replay(): void {
    this.visible = true;
    this.dispersing = false;
    this.disperseFrame = 0;
    this.frame = 0;
    this.startTimer();
    this.bump();
  }

  collapse(): Promise<void> {
    if (!this.visible) return Promise.resolve();
    if (this.dispersing) return this.waitForCollapse();

    if (this.frame < ASSEMBLE_FRAMES) {
      this.hideNow();
      return Promise.resolve();
    }

    const done = this.waitForCollapse();
    this.dispersing = true;
    this.disperseFrame = 0;
    this.startTimer();
    this.bump();
    return done;
  }

  dispose(): void {
    this.stopTimer();
    this.resolveCollapseWaiters();
  }

  invalidate(): void {
    // Frame-driven component; no render cache to invalidate.
  }

  render(width: number): string[] {
    if (!this.visible || width < MIN_BANNER_WIDTH) return [];

    const metrics = this.getRenderMetrics(width);
    const cells = this.buildCells(metrics.scale);
    const lines = Array<string>(metrics.topPadding).fill("");

    for (let sy = metrics.bounds.minY; sy <= metrics.bounds.maxY; sy++) {
      let line = "";
      for (let sx = metrics.bounds.minX; sx <= metrics.bounds.maxX; sx++) {
        const cell = cells.get(pointKey(sx, sy));
        line += cell ? `${this.styled(cell)} ` : "  ";
      }
      lines.push(centerLine(line, width, metrics.fieldWidth));
    }

    return lines;
  }

  private getRenderMetrics(width: number): RenderMetrics {
    const scale = getFieldScale(width, this.tui.terminal.rows);
    const bounds = getScaledBounds(scale);
    const fieldWidth = (bounds.maxX - bounds.minX + 1) * CELL_WIDTH;
    const fieldHeight = bounds.maxY - bounds.minY + 1;
    const topPadding = Math.max(
      MIN_TOP_PADDING,
      Math.floor((this.tui.terminal.rows - RESERVED_ROWS - fieldHeight) / 2),
    );

    return { scale, bounds, fieldWidth, topPadding };
  }

  private buildCells(scale: number): Map<string, StyledGlyph> {
    const cells = new Map<string, StyledGlyph>();
    const phase = this.currentPhase();

    if (phase === "disperse") {
      const progress = clamp(this.disperseFrame / DISPERSAL_FRAMES, 0, 1);
      for (const particle of this.particles) {
        const glyph = this.disperseGlyph(progress, particle);
        if (!glyph) continue;

        const pos = getDispersePosition(particle, progress, scale);
        this.setCell(cells, pos.x, pos.y, glyph);
      }
      return cells;
    }

    for (const particle of this.particles) {
      const progress = getParticleProgress(this.frame, particle);
      const pos = getAssemblePosition(particle, progress, scale);
      this.setCell(cells, pos.x, pos.y, this.particleGlyph(progress, particle));
    }

    if (phase === "idle") this.applyIdle(cells, scale);

    return cells;
  }

  private particleGlyph(progress: number, particle: Particle): StyledGlyph {
    if (progress >= 0.94) return finalGlyph(particle.token);

    if (progress > 0.12 && progress < 0.82 && this.twinkles(particle)) {
      return { text: "*", color: "accent", bold: true, rank: 25 };
    }

    if (progress >= 0.68) {
      return particle.token === "#" || particle.token === "m"
        ? { text: "●", color: "accent", bold: true, rank: 30 }
        : { text: "•", color: "accent", bold: true, rank: 28 };
    }

    if (progress >= 0.28) return { text: "•", color: "muted", rank: 20 };

    return { text: "·", color: "dim", rank: 10 };
  }

  private disperseGlyph(progress: number, particle: Particle): StyledGlyph | null {
    const fadeProgress = clamp(progress * 1.2 - (1 - particle.radialFactor) * 0.5, 0, 1);
    const terminalFade = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
    const fade = (1 - fadeProgress) * terminalFade;

    if (fade <= 0.08) return null;
    if (fade > 0.7) {
      return particle.token === "#" || particle.token === "m"
        ? { text: "●", color: "accent", bold: true, rank: 38 }
        : { text: "•", color: "accent", bold: true, rank: 34 };
    }
    if (fade > 0.4) return { text: "•", color: "muted", rank: 22 };
    return { text: "·", color: "dim", rank: 12 };
  }

  private applyIdle(cells: Map<string, StyledGlyph>, scale: number): void {
    const t = this.frame - ASSEMBLE_FRAMES;

    for (const particle of this.particles) {
      const pos = scalePoint(particle.targetX, particle.targetY, scale);
      const wave = Math.sin(t * 0.22 - (particle.targetX * 0.7 + particle.targetY * 1.1));
      const base = finalGlyph(particle.token);

      if (wave > 0.55) {
        const sparkle =
          particle.token === "#" && Math.floor(particle.targetX * 3 + particle.targetY * 5 + t) % 6 === 0;
        this.setCell(cells, pos.x, pos.y, {
          text: sparkle ? "*" : base.text,
          color: "accent",
          bold: true,
          rank: 46,
        });
      } else if (wave > -0.2) {
        this.setCell(cells, pos.x, pos.y, base);
      } else {
        this.setCell(cells, pos.x, pos.y, { ...base, bold: false, rank: base.rank - 4 });
      }
    }
  }

  private twinkles(particle: Particle): boolean {
    return (this.frame + particle.twinklePhase) % 12 < 2;
  }

  private currentPhase(): Phase {
    if (this.dispersing) return "disperse";
    if (this.frame < ASSEMBLE_FRAMES) return "assemble";
    return "idle";
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

  private hideNow(): void {
    this.visible = false;
    this.dispersing = false;
    this.stopTimer();
    this.resolveCollapseWaiters();
    this.bump();
  }

  private waitForCollapse(): Promise<void> {
    return new Promise((resolve) => this.collapseResolvers.push(resolve));
  }

  private startTimer(): void {
    this.stopTimer();
    this.intervalMs = this.frameIntervalMs(this.currentPhase());
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  private frameIntervalMs(phase: Phase): number {
    if (phase === "disperse") return DISPERSE_FRAME_MS;
    if (phase === "idle") return AMBIENT_FRAME_MS;
    return ASSEMBLE_FRAME_MS;
  }

  private tick(): void {
    if (this.dispersing) {
      this.disperseFrame += 1;
      if (this.disperseFrame >= DISPERSAL_FRAMES) {
        this.hideNow();
        return;
      }
    } else {
      this.frame += 1;
      const desired = this.frameIntervalMs(this.currentPhase());
      if (desired !== this.intervalMs) this.startTimer();
    }

    this.bump();
  }

  private stopTimer(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = undefined;
    this.intervalMs = 0;
  }

  private resolveCollapseWaiters(): void {
    const resolvers = this.collapseResolvers;
    this.collapseResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  private bump(): void {
    this.tui.requestRender();
  }
}

function finalGlyph(token: PiToken): StyledGlyph {
  if (token === "#") return { text: "●", color: "accent", bold: true, rank: 40 };
  if (token === "m") return { text: "•", color: "accent", bold: true, rank: 36 };
  return { text: "·", color: "accent", bold: false, rank: 32 };
}

function getFieldScale(width: number, rows: number): number {
  const maxCellsByWidth = Math.floor(width / CELL_WIDTH);
  const widthScale = maxCellsByWidth / FIELD_WIDTH;
  const availableRows = Math.max(1, rows - RESERVED_ROWS - MIN_TOP_PADDING);
  const heightScale = availableRows / FIELD_HEIGHT;

  return Math.min(1, widthScale, heightScale);
}

function getScaledBounds(scale: number): ScaledBounds {
  return {
    minX: Math.round(CENTER_X + (0 - CENTER_X) * scale),
    maxX: Math.round(CENTER_X + (FIELD_WIDTH - 1 - CENTER_X) * scale),
    minY: Math.round(CENTER_Y + (0 - CENTER_Y) * scale),
    maxY: Math.round(CENTER_Y + (FIELD_HEIGHT - 1 - CENTER_Y) * scale),
  };
}

function centerLine(line: string, width: number, lineWidth = visibleWidth(line)): string {
  if (lineWidth >= width) return truncateToWidth(line, width);

  const left = Math.floor((width - lineWidth) / 2);
  return `${" ".repeat(left)}${line}`;
}

function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
