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

  it("replaces tool content with a pending line", () => {
    expect(
      renderFrame(["read file", "", "old content"], 18, "tool", "pending", {
        bodyStartAfter: 1,
        pendingLine: "\x1b[2m reading...\x1b[22m",
        pendingLineMode: "replace",
      }),
    ).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m tool [90m─────────╮[39m",
        "[90m│[39mread file       [90m│[39m",
        "[90m│[39m[2m reading...     [22m[90m│[39m",
        "[90m╰────────────────╯[39m",
      ]
    `);
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
