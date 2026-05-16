import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable, ToolState } from "./types";
import { ORIGINAL_RENDER, PATCHED } from "./symbols";
import { renderFrame, type FrameOptions } from "../ui/frame";

interface ToolExecutionLike extends Component {
  toolName?: string;
  isPartial?: boolean;
  result?: { isError?: boolean };
  callRendererComponent?: Component;
  resultRendererComponent?: Component;
  getRenderShell?: () => "default" | "self";
}

function asToolExecution(component: Component): ToolExecutionLike {
  return component as ToolExecutionLike;
}

function getToolState(component: Component): ToolState {
  const tool = asToolExecution(component);
  if (tool.result?.isError) return "error";
  if (tool.result && !tool.isPartial) return "success";
  return "pending";
}

function getToolFrameOptions(component: Component, renderWidth: number): FrameOptions {
  const tool = asToolExecution(component);
  if (!tool.result || !tool.callRendererComponent) {
    return {};
  }

  if (tool.toolName === "edit" || tool.toolName === "write") {
    return { separatorAfter: 2 };
  }

  if (!tool.resultRendererComponent) {
    return {};
  }

  const shell = tool.getRenderShell?.() ?? "default";
  const callWidth = shell === "default" ? Math.max(1, renderWidth - 2) : renderWidth;
  const callLineCount = tool.callRendererComponent.render(callWidth).length;
  if (callLineCount === 0) return {};

  return { separatorAfter: shell === "default" ? callLineCount + 1 : callLineCount };
}

export function patchRender(prototype: Renderable, kind: FrameKind): void {
  if (prototype[PATCHED]) return;

  const original = prototype.render;
  prototype[PATCHED] = true;
  prototype[ORIGINAL_RENDER] = original;

  prototype.render = function patchedRender(this: Component, width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const rendered = original.call(this, innerWidth);
    const toolState = kind === "tool" ? getToolState(this) : "pending";
    const options = kind === "tool" ? getToolFrameOptions(this, innerWidth) : {};
    return renderFrame(rendered, width, kind, toolState, options);
  };
}
