import type { Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";
import { clearFrameRenderCache, getCachedFrameRows, setCachedFrameRows } from "./render-cache";

function component(properties: Record<string, unknown> = {}): Component {
  return {
    render: () => [],
    invalidate: () => {},
    ...properties,
  } as Component;
}

describe("frame render cache", () => {
  beforeEach(() => {
    clearFrameRenderCache();
  });

  it("reuses rows for the same component, width, kind, state, and rendered rows", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "user" as const,
      toolState: "pending" as const,
      rendered: ["hello"],
    };
    const output = ["framed hello"];

    expect(getCachedFrameRows(request)).toBeUndefined();

    setCachedFrameRows(request, output);

    expect(getCachedFrameRows(request)).toBe(output);
  });

  it("misses when the width changes", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "user" as const,
      toolState: "pending" as const,
      rendered: ["hello"],
    };

    setCachedFrameRows(request, ["framed hello"]);

    expect(getCachedFrameRows({ ...request, width: 24 })).toBeUndefined();
  });

  it("misses when original rendered rows change", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "user" as const,
      toolState: "pending" as const,
      rendered: ["hello"],
    };

    setCachedFrameRows(request, ["framed hello"]);

    expect(getCachedFrameRows({ ...request, rendered: ["changed"] })).toBeUndefined();
  });

  it("bypasses pending tool renders", () => {
    const owner = component({ toolName: "read", args: { file_path: "a.ts" } });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "pending" as const,
      rendered: ["read", "", "loading"],
    };

    setCachedFrameRows(request, ["framed read"]);

    expect(getCachedFrameRows(request)).toBeUndefined();
  });

  it("includes bash command and timeout in the key", () => {
    const owner = component({ toolName: "bash", args: { command: "pnpm test", timeout: 30 } }) as Component & {
      args: { command: string; timeout?: number };
    };
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["$ pnpm test", "", "done"],
    };

    setCachedFrameRows(request, ["framed bash"]);
    owner.args = { command: "pnpm test", timeout: 60 };

    expect(getCachedFrameRows(request)).toBeUndefined();
  });

  it("does not serialize non-bash tool args", () => {
    const circularArgs: Record<string, unknown> = { file_path: "a.ts" };
    circularArgs.self = circularArgs;
    const owner = component({ toolName: "read", args: circularArgs });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["read a.ts", "", "done"],
    };
    const output = ["framed read"];

    setCachedFrameRows(request, output);

    expect(getCachedFrameRows(request)).toBe(output);
  });

  it("normalizes bash command whitespace in the key", () => {
    const owner = component({ toolName: "bash", args: { command: "pnpm    test" } }) as Component & {
      args: { command: string };
    };
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["$ pnpm test", "", "done"],
    };
    const output = ["framed bash"];

    setCachedFrameRows(request, output);
    owner.args = { command: " pnpm test " };

    expect(getCachedFrameRows(request)).toBe(output);
  });

  it("misses when tool output boundary changes", () => {
    const owner = component({ toolName: "write" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["write", "file.ts", "", "done"],
      bodyStartAfter: 1,
      splitToolOutput: true,
    };

    setCachedFrameRows(request, ["framed write"]);

    expect(getCachedFrameRows({ ...request, bodyStartAfter: 2 })).toBeUndefined();
  });

  it("misses when tool expanded state changes", () => {
    const owner = component({ toolName: "read" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["read file", "", "contents"],
      expanded: false,
    };

    setCachedFrameRows(request, ["collapsed read"]);

    expect(getCachedFrameRows({ ...request, expanded: true })).toBeUndefined();
  });

  it("misses when tool collapse state changes", () => {
    const owner = component({ toolName: "read" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["read file", "", "contents"],
      collapseToolOutput: true,
    };

    setCachedFrameRows(request, ["collapsed read"]);

    expect(getCachedFrameRows({ ...request, collapseToolOutput: false })).toBeUndefined();
  });

  it("misses when edit trailing blank trimming changes", () => {
    const owner = component({ toolName: "edit" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["edit file", "", "diff", ""],
      trimToolOutputTrailingBlanks: false,
    };

    setCachedFrameRows(request, ["framed edit"]);

    expect(getCachedFrameRows({ ...request, trimToolOutputTrailingBlanks: true })).toBeUndefined();
  });

  it("misses when fallback collapsed hint changes", () => {
    const owner = component({ toolName: "bash" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["$ echo ok", "", "ok"],
      fallbackCollapsedHint: false,
    };

    setCachedFrameRows(request, ["framed bash"]);

    expect(getCachedFrameRows({ ...request, fallbackCollapsedHint: true })).toBeUndefined();
  });

  it("misses when read image output is hidden", () => {
    const owner = component({ toolName: "read" });
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["read image", "", "image hidden"],
      hideToolOutput: false,
    };

    setCachedFrameRows(request, ["framed read"]);

    expect(getCachedFrameRows({ ...request, hideToolOutput: true })).toBeUndefined();
  });

  it("does not cache oversized source rows", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "user" as const,
      toolState: "pending" as const,
      rendered: Array.from({ length: 201 }, (_, index) => `line ${index}`),
    };

    setCachedFrameRows(request, ["framed"]);

    expect(getCachedFrameRows(request)).toBeUndefined();
  });

  it("does not cache terminal image source rows", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "tool" as const,
      toolState: "success" as const,
      rendered: ["before", "\x1b_Gimage-data", "after"],
    };

    setCachedFrameRows(request, ["framed image"]);

    expect(getCachedFrameRows(request)).toBeUndefined();
  });

  it("does not cache oversized output rows", () => {
    const owner = component();
    const request = {
      component: owner,
      width: 20,
      kind: "user" as const,
      toolState: "pending" as const,
      rendered: ["hello"],
    };

    setCachedFrameRows(request, Array.from({ length: 251 }, (_, index) => `framed ${index}`));

    expect(getCachedFrameRows(request)).toBeUndefined();
  });
});
