import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { patchRender } from "./core/patch";
import { setActiveTheme } from "./core/state";
import { warmBashHighlighter } from "./ui/shiki";
import type { Renderable } from "./core/types";

export default function chatFrames(pi: ExtensionAPI) {
  patchRender(UserMessageComponent.prototype as Renderable, "user");
  patchRender(ToolExecutionComponent.prototype as Renderable, "tool");

  pi.on("session_start", (_event, ctx) => {
    setActiveTheme(ctx.ui.theme);
    warmBashHighlighter();
  });
}
