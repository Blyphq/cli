import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { CommandContext, CommandDefinition } from "../types.js";
import { showInfo } from "../lib/output.js";

function getCliVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const packagePath = `${dir}/../../package.json`;
  try {
    const data = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      version?: string;
    };
    return data.version ?? "0.1.5";
  } catch {
    return "0.1.5";
  }
}

export const versionCommand: CommandDefinition = {
  name: "version",
  description: "Print CLI version.",
  usage: "blyp --version",
  aliases: ["-V", "--version"],
  async run(_context: CommandContext): Promise<void> {
    showInfo(getCliVersion());
  },
};
