import { describe, expect, it, vi } from "vitest";
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

  it("renders tool frames with separators", () => {
    expect(
      renderFrame(["read file", "", "contents"], 16, "tool", "success", { separatorAfter: 1 }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────╮[39m",
        "[32m│[39mread file     [32m│[39m",
        "[32m├──────────────┤[39m",
        "[32m│[39m              [32m│[39m",
        "[32m│[39mcontents      [32m│[39m",
        "[32m╰──────────────╯[39m",
      ]
    `);
  });

  it("replaces tool content with a pending line", () => {
    expect(
      renderFrame(["read file", "", "old content"], 18, "tool", "pending", {
        separatorAfter: 1,
        pendingLine: "\x1b[2m reading...\x1b[22m",
        pendingLineMode: "replace",
      }),
    ).toMatchInlineSnapshot(`
      [
        "[90m╭─[39m tool [90m─────────╮[39m",
        "[90m│[39mread file       [90m│[39m",
        "[90m├────────────────┤[39m",
        "[90m│[39m[2m reading...[22m     [90m│[39m",
        "[90m╰────────────────╯[39m",
      ]
    `);
  });

  it("pulls bottom-right tool hints from content", () => {
    expect(
      renderFrame(["read file", "", "3 lines (ctrl+o to expand)"], 32, "tool", "success", { separatorAfter: 1 }),
    ).toMatchInlineSnapshot(`
      [
        "[32m╭─[39m tool [32m───────────────────────╮[39m",
        "[32m│[39mread file                     [32m│[39m",
        "[32m├──────────────────────────────┤[39m",
        "[32m│[39m                              [32m│[39m",
        "[32m│[39m3 lines                       [0m[32m│[39m",
        "[32m│[39m                              [32m│[39m",
        "[32m╰───────────[39m ctrl+o to expand [32m─╯[39m",
      ]
    `);
  });

  it("returns unframed lines for empty content", () => {
    expect(renderFrame(["", ""], 12, "user")).toEqual(["", ""]);
  });
});
