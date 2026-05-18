export interface FrameContent {
  leadingBlankLines: string[];
  textBody: string[];
  terminalImageRows: string[];
  oscStart: boolean;
  oscEnd: boolean;
  bodyStartAfter?: number;
  pendingLine?: string;
  pendingLineMode?: "replace" | "prepend";
  bottomRightHint?: string;
}
