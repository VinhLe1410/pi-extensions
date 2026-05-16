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
  it("uses bash args for the header and pending line", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "bash",
          args: { command: "pnpm    test", timeout: 30 },
          callRendererComponent: component(["ignored rendered shell", ""]),
        }),
        24,
        ["ignored rendered shell", "", "output"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "headerLine": "$ pnpm test (timeout [0m...[0m",
        "headerLineSpan": 1,
        "pendingLine": "[2m executing...[22m",
        "pendingLineMode": "replace",
        "separatorAfter": 2,
      }
    `);
  });

  it("does not re-render bash call components when rendered lines contain the header span", () => {
    const render = vi.fn(() => ["ignored rendered shell", ""]);

    expect(
      getToolFrameOptions(
        component([], {
          toolName: "bash",
          args: { command: "pnpm test" },
          callRendererComponent: { render, invalidate: () => {} },
        }),
        24,
        ["ignored rendered shell", "", "output"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "headerLine": "$ pnpm test",
        "headerLineSpan": 1,
        "pendingLine": "[2m executing...[22m",
        "pendingLineMode": "replace",
        "separatorAfter": 2,
      }
    `);
    expect(render).not.toHaveBeenCalled();
  });

  it("collapses multi-line rendered call headers", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "read",
          callRendererComponent: component(["read", "very-long-file-name.ts", "", "body"]),
        }),
        14,
        ["read", "very-long-file-name.ts", "", "body"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "headerLine": "read very-l...[0m",
        "headerLineSpan": 2,
        "pendingLine": "[2m reading...[22m",
        "pendingLineMode": "replace",
        "separatorAfter": 3,
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
        14,
        ["", "edit", "file.ts", "", "diff"],
        "pending",
      ),
    ).toMatchInlineSnapshot(`
      {
        "headerLine": "edit file.t...\u001b[0m",
        "headerLineSpan": 2,
        "pendingLine": "\u001b[2m editing...\u001b[22m",
        "pendingLineMode": "replace",
        "separatorAfter": 2,
      }
    `);
    expect(render).not.toHaveBeenCalled();
  });

  it("falls back to rendered body separators without a call header", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "write",
        }),
        20,
        ["", "Write file", "path.ts", "", "done"],
        "success",
      ),
    ).toEqual({ separatorAfter: 2 });
  });
});
