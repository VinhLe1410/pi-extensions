import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  SkillInvocationMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { patchRender } from "./core/patch";
import { unpatchRender } from "./core/patch-manager";
import { setActiveTheme } from "./core/state";
import type { Renderable } from "./core/types";

export default function chatFrames(pi: ExtensionAPI) {
  const userPrototype = UserMessageComponent.prototype as Renderable;
  const toolPrototype = ToolExecutionComponent.prototype as Renderable;
  const skillPrototype = SkillInvocationMessageComponent.prototype as Renderable;

  patchRender(userPrototype, "user");
  patchRender(toolPrototype, "tool");
  patchRender(skillPrototype, "skill");

  pi.on("session_start", (_event, ctx) => {
    setActiveTheme(ctx.ui.theme);
  });

  pi.on("session_shutdown", () => {
    unpatchRender(userPrototype);
    unpatchRender(toolPrototype);
    unpatchRender(skillPrototype);
  });
}
