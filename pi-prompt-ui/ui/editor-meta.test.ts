import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { UsageSnapshot } from "../core/types";
import type { UsageState } from "../seams/usage-state";
import { buildEditorMeta } from "./editor-meta";

const theme = {
  fg: (_color: string, text: string) => text,
} as Theme;

function usageState(snapshot: UsageSnapshot | null): UsageState {
  return {
    start() {},
    stop() {},
    current: () => snapshot,
    onChange: () => () => {},
  };
}

function ctx(provider: string): ExtensionContext {
  return {
    model: {
      name: "Claude Sonnet",
      id: "claude-sonnet",
      provider,
    },
  } as ExtensionContext;
}

describe("buildEditorMeta", () => {
  it("renders model, provider, thinking level, and quota windows", () => {
    const meta = buildEditorMeta(
      ctx("anthropic"),
      theme,
      usageState({
        provider: "claude",
        fetchedAt: Date.now(),
        windows: [{ label: "5h", usedPercent: 42.4, resetsIn: "2h" }],
      }),
      "high",
    );

    expect(meta.modelLabel).toBe("Claude Sonnet");
    expect(meta.providerLabel).toBe("Anthropic");
    expect(meta.thinkingLabel).toBe("high");
    expect(meta.quotaLabels).toEqual(["5h: 42%  2h"]);
  });

  it("keeps only the Copilot premium quota window", () => {
    const meta = buildEditorMeta(
      ctx("github-copilot"),
      theme,
      usageState({
        provider: "copilot",
        fetchedAt: Date.now(),
        windows: [
          { label: "Requests", usedPercent: 10 },
          { label: "Premium", usedPercent: 20 },
        ],
      }),
      "off",
    );

    expect(meta.providerLabel).toBe("Copilot");
    expect(meta.thinkingLabel).toBeUndefined();
    expect(meta.quotaLabels).toEqual(["Premium: 20%"]);
  });
});
