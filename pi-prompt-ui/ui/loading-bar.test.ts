import { describe, expect, it } from "vitest";
import type { LoadingBarConfig } from "../core/config";
import { createLoadingBarFrames } from "./loading-bar";

function config(overrides: Partial<LoadingBarConfig> = {}): LoadingBarConfig {
  return {
    enabled: true,
    intervalMs: 100,
    trackWidth: 5,
    trackChar: "·",
    kernel: "░█░",
    ...overrides,
  };
}

describe("createLoadingBarFrames", () => {
  it("slides a clipped glow across a fixed dot track and back", () => {
    const frames = createLoadingBarFrames(config());

    expect(frames).toEqual([
      "·····",
      "░····",
      "█░···",
      "░█░··",
      "·░█░·",
      "··░█░",
      "···░█",
      "····░",
      "·····",
      "····░",
      "···░█",
      "··░█░",
      "·░█░·",
      "░█░··",
      "█░···",
      "░····",
    ]);
  });

  it("returns no frames when disabled", () => {
    expect(createLoadingBarFrames(config({ enabled: false }))).toEqual([]);
  });
});
