import { cancel, isCancel, multiselect, spinner } from "@clack/prompts";

import type { CommandContext, CommandDefinition } from "../types.js";
import { generateClaudeMd } from "../lib/claude-md.js";
import { CliError } from "../lib/errors.js";
import {
  getSkillsInstallUsage,
  installSkillFromDirectory,
  parseSkillsInstallArgs,
  resolveInstallSources,
} from "../lib/skills.js";
import { showNote, showSuccess } from "../lib/output.js";

function buildSkillsHelpText(): string {
  return [
    "Install and manage Blyp skills.",
    "",
    getSkillsInstallUsage(),
    "If no source is provided, skills from Blyphq/skills are listed for selection.",
    'Use "blyp skills install claude" to generate a project CLAUDE.md file.',
    "The CLAUDE.md generator can use OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
  ].join("\n");
}

export const skillsCommand: CommandDefinition = {
  name: "skills",
  description: "Install and manage Blyp skills.",
  usage: "blyp skills install [source-or-skill-name|claude] [--force]",
  async run(context: CommandContext): Promise<void> {
    const [subcommand, ...subcommandArgs] = context.argv;

    if (subcommand === "-h" || subcommand === "--help") {
      showNote("Skills", buildSkillsHelpText());
      return;
    }

    if (subcommand !== "install") {
      throw new CliError(getSkillsInstallUsage());
    }

    const installArgs = parseSkillsInstallArgs(subcommandArgs);

    if (installArgs.sourceArg === "claude") {
      const result = await generateClaudeMd({
        cwd: context.cwd,
        force: installArgs.force,
      });

      showSuccess(
        result.created ? "Created CLAUDE.md." : "Updated CLAUDE.md.",
      );
      showNote("Destination", result.path);
      return;
    }

    const installSources = await resolveInstallSources(installArgs.sourceArg);

    try {
      const selectedSkills = await selectSkillsToInstall(installSources, installArgs.sourceArg);

      if (selectedSkills.length === 0) {
        throw new CliError("No skills were selected for installation.");
      }

      for (const skill of selectedSkills) {
        const status = spinner();
        status.start(`Installing skill "${skill.name}"`);

        try {
          const result = await installSkillFromDirectory({
            cwd: context.cwd,
            sourceDir: skill.sourceDir,
            force: installArgs.force,
          });

          status.stop(`Installed skill "${result.skillName}"`);
          showSuccess(`Installed skill "${result.skillName}"`);
          showNote("Destination", result.targetDir);
        } catch (error) {
          status.stop(`Skill installation failed for "${skill.name}"`);
          throw error;
        }
      }
    } finally {
      await installSources.cleanup();
    }
  },
};

async function selectSkillsToInstall(
  installSources: Awaited<ReturnType<typeof resolveInstallSources>>,
  sourceArg: string | null,
) {
  if (!installSources.shouldPrompt) {
    return installSources.skills;
  }

  const selected = await multiselect({
    message:
      sourceArg === null
        ? "Select the skills to install from Blyphq/skills"
        : `Select the skills to install from Blyphq/skills`,
    options: installSources.skills.map((skill) => ({
      value: skill.name,
      label: skill.name,
      hint: skill.description ?? undefined,
    })),
    required: false,
  });

  if (isCancel(selected)) {
    cancel("Skill installation was cancelled.");
    throw new CliError("Skill installation was cancelled.");
  }

  return installSources.skills.filter((skill) => selected.includes(skill.name));
}
