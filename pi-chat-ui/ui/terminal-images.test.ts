import { describe, expect, it } from "vitest";
import { splitTerminalImageRows } from "./terminal-images";

const kittyImage = "\x1b_Ga=T,f=100,q=2,C=1,c=40,r=3,i=123;AAAA\x1b\\";
const itermImage = "\x1b[2A\x1b]1337;File=inline=1;width=40;height=auto:AAAA\x07";

describe("splitTerminalImageRows", () => {
  it("moves Kitty trailing placeholder rows out of text content", () => {
    expect(splitTerminalImageRows(["header", "", kittyImage, "", "", "tail"])).toEqual({
      textLines: ["header", "tail"],
      imageRows: ["", kittyImage, "", ""],
    });
  });

  it("keeps non-placeholder rows after Kitty images in text content", () => {
    expect(splitTerminalImageRows(["header", kittyImage, "tail"])).toEqual({
      textLines: ["header", "tail"],
      imageRows: [kittyImage],
    });
  });

  it("keeps iTerm leading placeholder rows with the image", () => {
    expect(splitTerminalImageRows(["header", "", "", "", itermImage, "tail"])).toEqual({
      textLines: ["header", "tail"],
      imageRows: ["", "", "", itermImage],
    });
  });
});
