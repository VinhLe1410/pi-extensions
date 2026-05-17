import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  BashExecutionComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  CustomMessageComponent,
  SkillInvocationMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { clearDebugWidget, registerDebugWidget } from "./core/debug";
import { patchRenderWithDebug } from "./core/debug-patch";
import { patchRender } from "./core/patch";
import { clearFrameRenderCache } from "./core/render-cache";
import { unpatchRender } from "./core/patch-manager";
import { setActiveTheme } from "./core/state";
import type { Renderable } from "./core/types";

export default function chatUi(pi: ExtensionAPI) {
  const userPrototype = UserMessageComponent.prototype as Renderable;
  const toolPrototype = ToolExecutionComponent.prototype as Renderable;
  const skillPrototype = SkillInvocationMessageComponent.prototype as Renderable;
  const customPrototype = CustomMessageComponent.prototype as Renderable;
  const bashPrototype = BashExecutionComponent.prototype as Renderable;
  const compactionPrototype = CompactionSummaryMessageComponent.prototype as Renderable;
  const branchPrototype = BranchSummaryMessageComponent.prototype as Renderable;

  const debugEnabled = process.env.PI_CHAT_UI_DEBUG === "1";
  const applyPatch = debugEnabled ? patchRenderWithDebug : patchRender;

  applyPatch(userPrototype, "user");
  applyPatch(toolPrototype, "tool");
  applyPatch(skillPrototype, "skill");
  applyPatch(customPrototype, "custom");
  applyPatch(bashPrototype, "bash");
  applyPatch(compactionPrototype, "compaction");
  applyPatch(branchPrototype, "branch");

  pi.on("session_start", (_event, ctx) => {
    clearFrameRenderCache();
    setActiveTheme(ctx.ui.theme);
    if (debugEnabled) registerDebugWidget(ctx);
  });

  pi.on("session_shutdown", () => {
    clearFrameRenderCache();
    if (debugEnabled) clearDebugWidget();
    unpatchRender(userPrototype);
    unpatchRender(toolPrototype);
    unpatchRender(skillPrototype);
    unpatchRender(customPrototype);
    unpatchRender(bashPrototype);
    unpatchRender(compactionPrototype);
    unpatchRender(branchPrototype);
  });
}
