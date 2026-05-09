import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import subagentsExtension from "./subagents/index.ts";

export default function combinedExtension(pi: ExtensionAPI) {
	subagentsExtension(pi);
}
