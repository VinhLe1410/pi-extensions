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
        "collapseToolOutput": true,
        "fallbackCollapsedHint": true,
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
        "collapseToolOutput": true,
        "fallbackCollapsedHint": true,
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
        "collapseToolOutput": true,
        "fallbackCollapsedHint": true,
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
        "trimToolOutputTrailingBlanks": true,
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

  it("marks edit output trailing blanks for trimming", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "edit",
          callRendererComponent: component([]),
          resultRendererComponent: component([]),
        }),
        ["edit file.ts", "", "-old", "+new", ""],
        "success",
      ),
    ).toMatchObject({ trimToolOutputTrailingBlanks: true });
  });

  it("marks pending write content previews as split output", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "write",
          callRendererComponent: component([]),
        }),
        ["write file.ts", "", "content"],
        "pending",
      ),
    ).toMatchObject({ bodyStartAfter: 1, splitToolOutput: true });
  });

  it("marks tool output as split when call and result components are available", () => {
    expect(
      getToolFrameOptions(
        component([], {
          toolName: "write",
          callRendererComponent: component([]),
          resultRendererComponent: component([]),
        }),
        ["write", "file.ts", "", "done"],
        "success",
      ),
    ).toMatchObject({ bodyStartAfter: 2, splitToolOutput: true });
  });

  it("collapses pending partial read and bash output", () => {
    expect(
      getToolFrameOptions(
        component([], { toolName: "read", result: { content: [{ type: "text" }] }, isPartial: true }),
        ["read file", "", "partial"],
        "pending",
      ),
    ).toMatchObject({ collapseToolOutput: true });

    expect(
      getToolFrameOptions(
        component([], { toolName: "bash", result: { content: [{ type: "text" }] }, isPartial: true }),
        ["$ long command", "", "partial"],
        "pending",
      ),
    ).toMatchObject({ collapseToolOutput: true });
  });

  it("collapses successful read and bash output until expanded", () => {
    expect(
      getToolFrameOptions(component([], { toolName: "read" }), ["read file", "", "contents"], "success"),
    ).toMatchObject({ collapseToolOutput: true });

    expect(
      getToolFrameOptions(component([], { toolName: "bash" }), ["$ test", "", "done"], "success"),
    ).toMatchObject({ collapseToolOutput: true });

    expect(
      getToolFrameOptions(component([], { toolName: "read", expanded: true }), ["read file", "", "contents"], "success"),
    ).not.toHaveProperty("collapseToolOutput");

    expect(
      getToolFrameOptions(component([], { toolName: "bash", expanded: true }), ["$ test", "", "done"], "success"),
    ).not.toHaveProperty("collapseToolOutput");
  });

  it("keeps failed read and bash output visible", () => {
    expect(
      getToolFrameOptions(component([], { toolName: "read", result: { isError: true } }), ["read file", "", "failed"], "error"),
    ).not.toHaveProperty("collapseToolOutput");

    expect(
      getToolFrameOptions(component([], { toolName: "bash", result: { isError: true } }), ["$ test", "", "failed"], "error"),
    ).not.toHaveProperty("collapseToolOutput");
  });

  it("marks read image output as hidden from result content or rendered image rows", () => {
    expect(
      getToolFrameOptions(
        component([], { toolName: "read", result: { content: [{ type: "image" }] } }),
        ["read image"],
        "success",
      ),
    ).toMatchObject({ hideToolOutput: true });

    expect(
      getToolFrameOptions(component([], { toolName: "read" }), ["read image", "\x1b_Gimage-data"], "success"),
    ).toMatchObject({ hideToolOutput: true });
  });
});
