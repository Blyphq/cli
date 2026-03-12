import { spinner } from "@clack/prompts";

import type { CommandContext, CommandDefinition } from "../types.js";
import { collectRuntimeInfo } from "../lib/runtime.js";
import { showInfo, showNote } from "../lib/output.js";

export const studioCommand: CommandDefinition = {
  name: "studio",
  description: "Start or manage the local Studio workflow.",
  usage: "blyphq studio",
  async run(context: CommandContext): Promise<void> {
    const status = spinner();

    status.start("Checking workspace context");
    const runtimeInfo = await collectRuntimeInfo(context.cwd);
    status.stop("Studio command is wired into the CLI");

    showInfo("Studio is not implemented yet.");
    showNote(
      "Next step",
      runtimeInfo.workspaceRoot
        ? `Future Studio orchestration can attach to ${runtimeInfo.workspaceRoot} without importing the web app directly.`
        : "Workspace root was not detected from the current directory.",
    );
  },
};
