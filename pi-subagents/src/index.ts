import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import subagentsExtension from "./subagents.ts";

export default function combinedExtension(pi: ExtensionAPI) {
	process.env.PI_SUBAGENT_DISABLE_COORDINATOR_ONLY_TURN ??= "1";
	subagentsExtension(pi);
}
