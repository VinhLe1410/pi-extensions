export interface ToolFrameRenderingOptions {
  bodyStartAfter?: number;
  splitToolOutput?: boolean;
  collapseToolOutput?: boolean;
  hideToolOutput?: boolean;
  trimToolOutputTrailingBlanks?: boolean;
}

export interface ToolFrameOptions extends ToolFrameRenderingOptions {
  expanded?: boolean;
}

export interface FrameContent extends ToolFrameRenderingOptions {
  leadingBlankLines: string[];
  textBody: string[];
  terminalImageRows: string[];
  oscStart: boolean;
  oscEnd: boolean;
  bottomRightHint?: string;
}
