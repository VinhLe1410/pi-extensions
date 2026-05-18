import type { Component } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { getToolFrameOptions, getToolState } from "./tool-adapter";

function component(lines: string[], properties: Record<string, unknown> = {}): Component {
  return {
    render: () => lines,
    invalidate: () => {},
    ...properties,
  } as Component;
}

describe("getToolState", () => {
  it("detects pending, success, and error states", () => {
    expect(getToolState(component([], { isPartial: true }))).toBe("pending");
    expect(getToolState(component([], { result: {}, isPartial: false }))).toBe("success");
    expect(getToolState(component([], { result: { isError: true } }))).toBe("error");
  });
});

describe("getToolFrameOptions", () => {
  it("uses the rendered header span as an invisible pending boundary", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "bash",
          args: { command: "pnpm    test", timeout: 30 },
          callRendererComponent: component(["ignored rendered shell", ""]),
        }),
        ["ignored rendered shell", "", "output"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "bodyStartAfter": 1,
        "pendingLine": "[2m executing...[22m",
        "pendingLineMode": "replace",
      }
    `);
  });

  it("does not re-render call components", () => {
    const render = vi.fn(() => ["ignored rendered shell", ""]);

    expect(
      getToolFrameOptions(
        component([], {
          toolName: "bash",
          args: { command: "pnpm test" },
          callRendererComponent: { render, invalidate: () => {} },
        }),
        ["ignored rendered shell", "", "output"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "bodyStartAfter": 1,
        "pendingLine": "[2m executing...[22m",
        "pendingLineMode": "replace",
      }
    `);
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps multi-line rendered call headers intact", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "read",
          callRendererComponent: component(["read", "very-long-file-name.ts", "", "body"]),
        }),
        ["read", "very-long-file-name.ts", "", "body"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "bodyStartAfter": 2,
        "pendingLine": "[2m reading...[22m",
        "pendingLineMode": "replace",
      }
    `);
  });

  it("does not re-render self-shell call components", () => {
    const render = vi.fn(() => ["edit", "file.ts", "", "diff"]);

    expect(
      getToolFrameOptions(
        component([], {
          toolName: "edit",
          getRenderShell: () => "self",
          callRendererComponent: { render, invalidate: () => {} },
        }),
        ["", "edit", "file.ts", "", "diff"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "bodyStartAfter": 2,
        "pendingLine": "\u001b[2m editing...\u001b[22m",
        "pendingLineMode": "replace",
      }
    `);
    expect(render).not.toHaveBeenCalled();
  });

  it("falls back to rendered body boundaries without a call header", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "write",
        }),
        ["", "Write file", "path.ts", "", "done"],
        "success",
      ),
    ).toEqual({ bodyStartAfter: 2 });
  });
});
