import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "./ansi";
import { renderFrame } from "./frame";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  keyText: () => "ctrl+o",
}));

describe("renderFrame", () => {
  it("renders user frames without changing body text", () => {
    expect(renderFrame(["hello", "world"], 12, "user")).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m user [90m───╮[39m",
        "[90m│[39mhello     [90m│[39m",
        "[90m│[39mworld     [90m│[39m",
        "[90m╰──────────╯[39m",
      ]
    `);
  });

  it("trims built-in user message boundary padding", () => {
    expect(renderFrame(["", "hello", ""], 12, "user")).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m user [90m───╮[39m",
        "[90m│[39mhello     [90m│[39m",
        "[90m╰──────────╯[39m",
      ]
    `);
  });

  it("renders tool frames without inner separators", () => {
    expect(
      renderFrame(["read file", "", "contents"], 16, "tool", "success", { bodyStartAfter: 1 }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────╮[39m",
        "[32m│[39mread file     [32m│[39m",
        "[32m│[39m              [32m│[39m",
        "[32m│[39mcontents      [32m│[39m",
        "[32m╰──────────────╯[39m",
      ]
    `);
  });

  it("strips Pi's built-in user bash borders before framing", () => {
    const output = renderFrame(["", "────────────", " $ echo Testing", "", " Testing", "────────────"], 18, "bash");

    expect(output).toMatchInlineSnapshot(`
      [
        "",
        "[36m╭─[39m bash [36m─────────╮[39m",
        "[36m│[39m $ echo Testing [36m│[39m",
        "[36m│[39m                [36m│[39m",
        "[36m│[39m Testing        [36m│[39m",
        "[36m╰────────────────╯[39m",
      ]
    `);
    expect(output.filter((line) => stripAnsi(line).trim() === "────────────")).toHaveLength(0);
  });

  it("trims pending tool trailing blank rows", () => {
    expect(renderFrame(["edit file", ""], 18, "tool", "pending", { bodyStartAfter: 1 })).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m tool [90m─────────╮[39m",
        "[90m│[39medit file       [90m│[39m",
        "[90m╰────────────────╯[39m",
      ]
    `);
  });

  it("collapses pending tool output without a placeholder", () => {
    expect(
      renderFrame(["read file", "", "old content"], 18, "tool", "pending", {
        bodyStartAfter: 1,
        splitToolOutput: true,
        collapseToolOutput: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m tool [90m─────────╮[39m",
        "[90m│[39mread file       [90m│[39m",
        "[90m╰────────────────╯[39m",
      ]
    `);
  });

  it("renders split tool output with an output separator", () => {
    expect(
      renderFrame(["write file", "", "done"], 18, "tool", "success", {
        bodyStartAfter: 1,
        splitToolOutput: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m─────────╮[39m",
        "[32m│[39mwrite file      [32m│[39m",
        "[32m├─[39m output [32m───────┤[39m",
        "[32m│[39mdone            [32m│[39m",
        "[32m╰────────────────╯[39m",
      ]
    `);
  });

  it("trims edit output trailing blank rows", () => {
    expect(
      renderFrame(["edit file.ts", "", "-old", "+new", ""], 22, "tool", "success", {
        bodyStartAfter: 1,
        splitToolOutput: true,
        trimToolOutputTrailingBlanks: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m─────────────╮[39m",
        "[32m│[39medit file.ts        [32m│[39m",
        "[32m├─[39m output [32m───────────┤[39m",
        "[32m│[39m-old                [32m│[39m",
        "[32m│[39m+new                [32m│[39m",
        "[32m╰────────────────────╯[39m",
      ]
    `);
  });

  it("renders pending write content preview with an output separator", () => {
    expect(
      renderFrame(["write file.ts", "", "content"], 22, "tool", "pending", {
        bodyStartAfter: 1,
        splitToolOutput: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m tool [90m─────────────╮[39m",
        "[90m│[39mwrite file.ts       [90m│[39m",
        "[90m├─[39m output [90m───────────┤[39m",
        "[90m│[39mcontent             [90m│[39m",
        "[90m╰────────────────────╯[39m",
      ]
    `);
  });

  it("collapses successful read output and keeps the expand hint", () => {
    expect(
      renderFrame(["read file", "", "3 lines (ctrl+o to expand)"], 32, "tool", "success", {
        bodyStartAfter: 1,
        splitToolOutput: true,
        collapseToolOutput: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────────────────────╮[39m",
        "[32m│[39mread file                     [32m│[39m",
        "[32m╰───────────[39m ctrl+o to expand [32m─╯[39m",
      ]
    `);
  });

  it("collapses successful bash output and keeps the expand hint", () => {
    const output = renderFrame(["$ pnpm test", "", "12 lines (ctrl+o to expand)"], 34, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      collapseToolOutput: true,
      fallbackCollapsedHint: true,
    });

    expect(output.some((line) => stripAnsi(line).includes("12 lines"))).toBe(false);
    expect(output.at(-1)).toContain("ctrl+o to expand");
  });

  it("shows a fallback expand hint when collapsed output has no built-in hint", () => {
    const bashOutput = renderFrame(["$ echo ok", "", "ok"], 34, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      collapseToolOutput: true,
      fallbackCollapsedHint: true,
    });
    const readOutput = renderFrame(["read file", "", "contents"], 34, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      collapseToolOutput: true,
      fallbackCollapsedHint: true,
    });

    expect(bashOutput.some((line) => stripAnsi(line).includes("│ok"))).toBe(false);
    expect(bashOutput.at(-1)).toContain("ctrl+o to expand");
    expect(readOutput.some((line) => stripAnsi(line).includes("contents"))).toBe(false);
    expect(readOutput.at(-1)).toContain("ctrl+o to expand");
  });

  it("shows failed read and bash output", () => {
    const readOutput = renderFrame(["read file", "", "permission denied"], 24, "tool", "error", {
      bodyStartAfter: 1,
      splitToolOutput: true,
    });
    const bashOutput = renderFrame(["$ test", "", "exit 1"], 24, "tool", "error", {
      bodyStartAfter: 1,
      splitToolOutput: true,
    });

    expect(readOutput.some((line) => stripAnsi(line).includes("output"))).toBe(true);
    expect(readOutput.some((line) => stripAnsi(line).includes("permission denied"))).toBe(true);
    expect(bashOutput.some((line) => stripAnsi(line).includes("output"))).toBe(true);
    expect(bashOutput.some((line) => stripAnsi(line).includes("exit 1"))).toBe(true);
  });

  it("shows expanded successful read and bash output exactly as provided", () => {
    const readOutput = renderFrame(["read file", "", "line 1"], 24, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      expanded: true,
    });
    const bashOutput = renderFrame(["$ echo ok", "", "ok"], 24, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      expanded: true,
    });

    expect(readOutput.some((line) => stripAnsi(line).includes("line 1"))).toBe(true);
    expect(bashOutput.some((line) => stripAnsi(line).includes("ok"))).toBe(true);
  });

  it("omits the output separator when split output is hidden", () => {
    expect(
      renderFrame(["read file", "", "3 lines (ctrl+o to expand)"], 32, "tool", "success", {
        bodyStartAfter: 1,
        splitToolOutput: true,
        collapseToolOutput: true,
      }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────────────────────╮[39m",
        "[32m│[39mread file                     [32m│[39m",
        "[32m╰───────────[39m ctrl+o to expand [32m─╯[39m",
      ]
    `);
  });

  it("preserves ANSI background rows in split tool output", () => {
    const bg = "\x1b[48;5;24moutput\x1b[49m";
    const output = renderFrame(["tool call", "", bg], 18, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
    });

    expect(output.some((line) => line.includes("\x1b[48;5;24moutput") && line.includes("\x1b[49m"))).toBe(true);
    expect(output.some((line) => stripAnsi(line).includes("─ output ") && line.includes("\x1b[48;5;24m"))).toBe(false);
  });

  it("pulls bottom-right tool hints from content", () => {
    expect(
      renderFrame(["read file", "", "3 lines (ctrl+o to expand)"], 32, "tool", "success", { bodyStartAfter: 1 }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────────────────────╮[39m",
        "[32m│[39mread file                     [32m│[39m",
        "[32m│[39m                              [32m│[39m",
        "[32m│[39m3 lines                       [0m[32m│[39m",
        "[32m╰───────────[39m ctrl+o to expand [32m─╯[39m",
      ]
    `);
  });

  it("hides read image output entirely", () => {
    const image = "\x1b_Ga=T,f=100,q=2,C=1,c=4,r=2,i=123;AAAA\x1b\\";
    const output = renderFrame(["read image", "", image, ""], 16, "tool", "success", {
      bodyStartAfter: 1,
      splitToolOutput: true,
      hideToolOutput: true,
      expanded: true,
    });

    expect(output.some((line) => line.includes(image))).toBe(false);
    expect(output.some((line) => stripAnsi(line).includes("output"))).toBe(false);
  });

  it("renders Kitty image rows inside tool frames", () => {
    const image = "\x1b_Ga=T,f=100,q=2,C=1,c=4,r=2,i=123;AAAA\x1b\\";
    const output = renderFrame(["read image", "", image, ""], 16, "tool", "success", { bodyStartAfter: 1 });

    expect(output.some((line) => line.includes(image) && line.includes("\x1b[16G"))).toBe(true);
    expect(output.at(-1)).toBe("\x1b[32m╰──────────────╯\x1b[39m");
  });

  it("keeps iTerm image rows outside tool frames", () => {
    const image = "\x1b[1A\x1b]1337;File=inline=1;width=4;height=auto:AAAA\x07";
    const output = renderFrame(["read image", "", image], 16, "tool", "success", { bodyStartAfter: 1 });

    const bottomBorderIndex = output.findIndex((line) => line.includes("╰"));
    const imageIndex = output.findIndex((line) => line.includes("\x1b]1337;File="));
    expect(bottomBorderIndex).toBeGreaterThan(-1);
    expect(imageIndex).toBeGreaterThan(bottomBorderIndex);
  });

  it("returns unframed lines for empty content", () => {
    expect(renderFrame(["", ""], 12, "user")).toEqual(["", ""]);
  });
});
