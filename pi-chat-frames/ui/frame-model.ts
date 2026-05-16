export interface FrameContent {
  leadingBlankLines: string[];
  textBody: string[];
  terminalImageRows: string[];
  oscStart: boolean;
  oscEnd: boolean;
  separatorAfter?: number;
  pendingLine?: string;
  pendingLineMode?: "replace" | "prepend";
  bottomRightHint?: string;
}

export interface FrameHeaderReplacement {
  line: string;
  span: number;
}
