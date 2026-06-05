import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderBorderLine, type BorderLine } from "./border-layout";

const separator = " • ";
const borderColor = (text: string): string => text;

function render(lineWidth: number, line: BorderLine): string {
  return renderBorderLine({ lineWidth, line, separator, borderColor });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderBorderLine", () => {
  it("renders styled and unstyled items to the requested visible width", () => {
    const output = render(24, {
      left: [{ id: "styled", text: "\x1b[31mred\x1b[39m", priority: 2 }],
      right: [{ id: "plain", text: "plain", priority: 1 }],
    });

    expect(visibleWidth(output)).toBe(24);
    expect(output).toContain("\x1b[31mred\x1b[39m");
    expect(stripAnsi(output)).toContain("plain");
  });

  it("drops top-like usage items before higher-priority model and thinking items", () => {
    const line: BorderLine = {
      left: [
        { id: "model", text: "model", priority: 50 },
        { id: "thinking", text: "thinking", priority: 40 },
      ],
      right: [
        { id: "session", text: "session", priority: 20 },
        { id: "weekly", text: "weekly", priority: 10 },
      ],
    };

    const withoutWeekly = stripAnsi(render(40, line));
    expect(withoutWeekly).toContain("model");
    expect(withoutWeekly).toContain("thinking");
    expect(withoutWeekly).toContain("session");
    expect(withoutWeekly).not.toContain("weekly");

    const withoutUsage = stripAnsi(render(31, line));
    expect(withoutUsage).toContain("model");
    expect(withoutUsage).toContain("thinking");
    expect(withoutUsage).not.toContain("session");
    expect(withoutUsage).not.toContain("weekly");
  });

  it("drops bottom-like cwd before branch before context", () => {
    const line: BorderLine = {
      left: [
        { id: "branch", text: "branch", priority: 30 },
        { id: "cwd", text: "~repo", priority: 10 },
      ],
      right: [{ id: "context", text: "context", priority: 40 }],
    };

    const withoutCwd = stripAnsi(render(24, line));
    expect(withoutCwd).toContain("branch");
    expect(withoutCwd).not.toContain("~repo");
    expect(withoutCwd).toContain("context");

    const onlyContext = stripAnsi(render(14, line));
    expect(onlyContext).not.toContain("branch");
    expect(onlyContext).not.toContain("~repo");
    expect(onlyContext).toContain("context");
  });

  it("drops an item instead of rendering adjacent left and right groups without a border bridge", () => {
    const output = stripAnsi(
      render(17, {
        left: [{ id: "left", text: "left", priority: 2 }],
        right: [{ id: "right", text: "right", priority: 1 }],
      }),
    );

    expect(output).toContain("left");
    expect(output).not.toContain("right");
    expect(output).toContain("─");
    expect(visibleWidth(output)).toBe(17);
  });

  it("uses deterministic same-priority tie-breaking by dropping later items first", () => {
    const output = stripAnsi(
      render(16, {
        left: [
          { id: "one", text: "one", priority: 1 },
          { id: "two", text: "two", priority: 1 },
          { id: "three", text: "three", priority: 1 },
        ],
        right: [],
      }),
    );

    expect(output).toContain("one");
    expect(output).toContain("two");
    expect(output).not.toContain("three");
  });

  it("preserves a border line when labels do not all fit", () => {
    const output = render(12, {
      left: [{ id: "long", text: "very-long-label", priority: 2 }],
      right: [{ id: "low", text: "low", priority: 1 }],
    });

    expect(visibleWidth(output)).toBe(12);
    expect(stripAnsi(output)).toContain("─");
    expect(stripAnsi(output)).not.toBe(" very-long-l");
  });

  it("handles extremely narrow widths without throwing", () => {
    const line: BorderLine = {
      left: [{ id: "long", text: "very-long-label", priority: 1 }],
      right: [],
    };

    expect(render(0, line)).toBe("");
    for (const width of [1, 2, 3]) {
      expect(() => render(width, line)).not.toThrow();
      expect(visibleWidth(render(width, line))).toBe(width);
    }
  });

  it("renders empty-label lines as plain borders", () => {
    expect(render(8, { left: [], right: [] })).toBe("────────");
  });
});
