import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { defaultConfig, type PromptUiConfig } from "../core/config";
import type { GitStatusSummary } from "../seams/git";
import type { RuntimeInfo } from "../seams/runtime";
import { renderStatusFooter } from "./status-footer";

const theme = {
  fg: (_color: string, text: string) => text,
} as Theme;

function footerData(statuses: Record<string, string> = {}): ReadonlyFooterDataProvider {
  return {
    getGitBranch: () => null,
    getAvailableProviderCount: () => 0,
    getExtensionStatuses: () => new Map(Object.entries(statuses)),
    onBranchChange: () => () => {},
  };
}

function config(placements: PromptUiConfig["extensionStatuses"]["placements"] = {}): PromptUiConfig {
  return {
    ...defaultConfig,
    extensionStatuses: {
      defaultPlacement: "right",
      placements,
    },
  };
}

function ctx(): ExtensionContext {
  return {
    cwd: "/tmp/project",
    model: { contextWindow: 200_000 },
    getContextUsage: () => ({
      tokens: 50_000,
      contextWindow: 200_000,
      percent: 25,
    }),
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: {
              input: 1200,
              output: 3400,
              cost: { total: 0.1234 },
            },
          },
        },
      ],
    },
  } as ExtensionContext;
}

const git: GitStatusSummary = {
  branch: "main",
  dirty: true,
  ahead: 1,
  behind: 2,
  conflicted: 1,
  untracked: 1,
  stashed: true,
  modified: 1,
  staged: 1,
  renamed: 1,
  deleted: 1,
  typechanged: 1,
};

const runtime: RuntimeInfo = {
  name: "nodejs",
  symbol: "",
  style: "bold green",
  version: "v24.0.0",
};

function render(placements: PromptUiConfig["extensionStatuses"]["placements"] = {}): string {
  const [line] = renderStatusFooter(
    ctx(),
    footerData({ lsp: "LSP", worker: "active" }),
    git,
    runtime,
    config(placements),
    180,
    theme,
  );
  return line;
}

describe("renderStatusFooter", () => {
  it("renders cwd, detailed git, runtime, context, tokens, cost, and right-default statuses", () => {
    const line = render();

    expect(line).toContain("󰝰 project");
    expect(line).toContain("on  main [=$✘»!T+?⇕]");
    expect(line).toContain("via");
    expect(line).toContain(" v24.0.0");
    expect(line).toContain("ctx 25%/200k");
    expect(line).toContain("↑1.2k ↓3.4k");
    expect(line).toContain("$0.123");
    expect(line).toMatch(/ LSP.* active.*ctx 25%\/200k/);
  });

  it("places statuses left, middle, or off from config", () => {
    const leftLine = render({ lsp: "left", worker: "off" });
    expect(leftLine).toMatch(/󰝰 project.* LSP.*ctx 25%\/200k/);
    expect(leftLine).not.toContain("active");

    const middleLine = render({ lsp: "middle", worker: "off" });
    expect(middleLine).toContain(" LSP");
    expect(middleLine).not.toContain("active");
  });
});
