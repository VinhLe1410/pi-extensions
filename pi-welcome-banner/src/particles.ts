import { CENTER_X, CENTER_Y, type PiToken, type Target } from "./glyph.ts";

export const ASSEMBLE_FRAME_MS = 55;
export const AMBIENT_FRAME_MS = 120;
export const DISPERSE_FRAME_MS = 38;

export const ASSEMBLE_FRAMES = 58;
export const DISPERSAL_FRAMES = 20;

export type Phase = "assemble" | "idle" | "disperse";

export type Particle = {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  implodeJitterX: number;
  implodeJitterY: number;
  radialFactor: number;
  delay: number;
  token: PiToken;
  swirl: number;
  twinklePhase: number;
};

export function createParticles(targets: readonly Target[]): Particle[] {
  const maxDist = Math.max(
    1,
    ...targets.map((target) => Math.hypot(target.x - CENTER_X, target.y - CENTER_Y)),
  );
  return targets.map((target, index) => buildParticle(target, index, targets.length, maxDist));
}

export function getParticleProgress(frame: number, particle: Particle): number {
  if (frame >= ASSEMBLE_FRAMES) return 1;

  const activeFrames = ASSEMBLE_FRAMES - particle.delay;
  return clamp((frame - particle.delay) / activeFrames, 0, 1);
}

export function getAssemblePosition(particle: Particle, progress: number, scale: number): { x: number; y: number } {
  const eased = easeInOutCubic(progress);
  const baseX = interpolate(particle.startX, particle.targetX, eased);
  const baseY = interpolate(particle.startY, particle.targetY, eased);

  // Tangential swirl that is strongest at the start and decays to zero as the
  // particle settles, so the dust spirals inward instead of travelling straight.
  const falloff = (1 - progress) * (1 - progress);
  const dx = particle.startX - CENTER_X;
  const dy = particle.startY - CENTER_Y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = -dy / len;
  const ty = dx / len;
  const x = baseX + tx * particle.swirl * falloff;
  const y = baseY + ty * particle.swirl * falloff;

  return scalePoint(x, y, scale);
}

export function getDispersePosition(particle: Particle, progress: number, scale: number): { x: number; y: number } {
  // Implosion: every particle retracts toward a tight cluster (±1 cell) around
  // the heart of π. Motion only ever converges, so it stays within the π
  // footprint and never reaches the box edge.
  const eased = easeInOutCubic(progress);
  const endX = CENTER_X + particle.implodeJitterX;
  const endY = CENTER_Y + particle.implodeJitterY;
  return scalePoint(
    interpolate(particle.targetX, endX, eased),
    interpolate(particle.targetY, endY, eased),
    scale,
  );
}

export function scalePoint(x: number, y: number, scale: number): { x: number; y: number } {
  return {
    x: Math.round(CENTER_X + (x - CENTER_X) * scale),
    y: Math.round(CENTER_Y + (y - CENTER_Y) * scale),
  };
}

function buildParticle(target: Target, index: number, count: number, maxDist: number): Particle {
  const angle = (index / count) * Math.PI * 2 + (hashPoint(target.x, target.y) % 100) / 100;
  const radiusX = 16 + (hashPoint(index, target.x) % 7);
  const radiusY = 8 + (hashPoint(index, target.y) % 5);
  const startX = Math.round(CENTER_X + Math.cos(angle) * radiusX);
  const startY = Math.round(CENTER_Y + Math.sin(angle) * radiusY);

  // Tight cluster around the heart so the implosion reads as a collapse to a
  // single glowing core rather than a scattered pile.
  const implodeJitterX = (hashPoint(target.x * 7, target.y) % 3) - 1;
  const implodeJitterY = (hashPoint(target.x, target.y * 7) % 3) - 1;
  // 0 at the heart, 1 at the outermost edge — drives the fade so the halo dims
  // first and the core winks out last.
  const radialFactor = Math.hypot(target.x - CENTER_X, target.y - CENTER_Y) / maxDist;

  const distanceDelay = Math.max(0, 10 - Math.hypot(target.x - CENTER_X, target.y - CENTER_Y) * 0.35);
  const delay = Math.floor((hashPoint(target.x + 3, target.y + 5) % 14) + distanceDelay);
  const swirl = 1 + (hashPoint(target.x * 3, target.y * 5) % 20) / 10;
  const twinklePhase = hashPoint(target.x + 11, target.y + 13) % 12;

  return {
    targetX: target.x,
    targetY: target.y,
    startX,
    startY,
    implodeJitterX,
    implodeJitterY,
    radialFactor,
    delay,
    token: target.token,
    swirl,
    twinklePhase,
  };
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashPoint(x: number, y: number): number {
  let value = Math.imul(x + 31, 73_856_093) ^ Math.imul(y + 17, 19_349_663);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return (value ^ (value >>> 16)) >>> 0;
}
