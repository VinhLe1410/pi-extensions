import { CENTER_X, CENTER_Y, type Target, type PiToken } from "./glyph.ts";

export const FRAME_MS = 55;
export const ASSEMBLE_FRAMES = 58;

export type Particle = {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  delay: number;
  token: PiToken;
};

export function createParticles(targets: readonly Target[]): Particle[] {
  return targets.map((target, index) => buildParticle(target, index, targets.length));
}

export function getParticleProgress(frame: number, particle: Particle): number {
  if (frame >= ASSEMBLE_FRAMES) return 1;

  const activeFrames = ASSEMBLE_FRAMES - particle.delay;
  return clamp((frame - particle.delay) / activeFrames, 0, 1);
}

export function getParticlePosition(particle: Particle, progress: number, scale: number): { x: number; y: number } {
  const eased = easeInOutCubic(progress);
  const rawX = interpolate(particle.startX, particle.targetX, eased);
  const rawY = interpolate(particle.startY, particle.targetY, eased);

  return {
    x: Math.round(CENTER_X + (rawX - CENTER_X) * scale),
    y: Math.round(CENTER_Y + (rawY - CENTER_Y) * scale),
  };
}

function buildParticle(target: Target, index: number, targetCount: number): Particle {
  const angle = (index / targetCount) * Math.PI * 2 + (hashPoint(target.x, target.y) % 100) / 100;
  const radiusX = 16 + (hashPoint(index, target.x) % 7);
  const radiusY = 8 + (hashPoint(index, target.y) % 5);
  const startX = Math.round(CENTER_X + Math.cos(angle) * radiusX);
  const startY = Math.round(CENTER_Y + Math.sin(angle) * radiusY);
  const distanceDelay = Math.max(0, 10 - Math.hypot(target.x - CENTER_X, target.y - CENTER_Y) * 0.35);
  const delay = Math.floor((hashPoint(target.x + 3, target.y + 5) % 14) + distanceDelay);

  return { targetX: target.x, targetY: target.y, startX, startY, delay, token: target.token };
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
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
