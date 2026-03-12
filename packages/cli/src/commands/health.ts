import { spinner } from "@clack/prompts";

import type { CommandContext, CommandDefinition } from "../types.js";
import { showNote, showSuccess } from "../lib/output.js";
import { collectRuntimeInfo, formatRuntimeSummary } from "../lib/runtime.js";

export const healthCommand: CommandDefinition = {
  name: "health",
  description: "Print basic runtime and workspace diagnostics.",
  usage: "blyphq health",
  async run(context: CommandContext): Promise<void> {
    const status = spinner();

    status.start("Inspecting runtime");
    const runtimeInfo = await collectRuntimeInfo(context.cwd);
    status.stop("Diagnostics collected");

    showSuccess("Environment looks reachable.");
    showNote("Health", formatRuntimeSummary(runtimeInfo));
  },
};
