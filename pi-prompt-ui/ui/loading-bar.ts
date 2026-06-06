import type { LoadingBarConfig } from "../core/config";

function repeatChar(char: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => char);
}

function renderFrame(
  trackWidth: number,
  trackChar: string,
  kernelChars: string[],
  kernelStart: number,
): string {
  const cells = repeatChar(trackChar, trackWidth);

  for (let kernelIndex = 0; kernelIndex < kernelChars.length; kernelIndex++) {
    const trackIndex = kernelStart + kernelIndex;
    if (trackIndex < 0 || trackIndex >= trackWidth) continue;
    cells[trackIndex] = kernelChars[kernelIndex]!;
  }

  return cells.join("");
}

function kernelStarts(trackWidth: number, kernelLength: number): number[] {
  const forward: number[] = [];
  for (let start = -kernelLength; start <= trackWidth; start++) {
    forward.push(start);
  }

  const backward: number[] = [];
  for (let start = trackWidth - 1; start > -kernelLength; start--) {
    backward.push(start);
  }

  return [...forward, ...backward];
}

export function createLoadingBarFrames(config: LoadingBarConfig): string[] {
  if (!config.enabled) return [];

  const trackWidth = Math.max(0, Math.round(config.trackWidth));
  const trackChar = Array.from(config.trackChar)[0] ?? "·";
  const kernelChars = Array.from(config.kernel);
  if (trackWidth <= 0 || kernelChars.length === 0) return [];

  return kernelStarts(trackWidth, kernelChars.length).map((start) =>
    renderFrame(trackWidth, trackChar, kernelChars, start),
  );
}
