import { access, cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./errors.js";

const SKILL_MARKDOWN_FILE = "SKILL.md";

export interface SkillsInstallArgs {
  readonly sourceArg: string | null;
  readonly force: boolean;
}

export interface SkillInstallPaths {
  readonly sourceDir: string;
  readonly skillName: string;
  readonly targetRoot: string;
  readonly targetDir: string;
}

export interface BundledSkill {
  readonly name: string;
  readonly description: string | null;
  readonly sourceDir: string;
}

export interface ResolvedInstallSources {
  readonly skills: readonly BundledSkill[];
  readonly shouldPrompt: boolean;
}

export interface InstallSkillFromDirectoryInput {
  readonly cwd: string;
  readonly sourceDir: string;
  readonly force: boolean;
}

export interface InstallSkillFromDirectoryResult {
  readonly skillName: string;
  readonly targetDir: string;
}

export function getSkillsInstallUsage(): string {
  return "Usage: blyp skills install [source-or-skill-name] [--force]";
}

export function parseSkillsInstallArgs(argv: readonly string[]): SkillsInstallArgs {
  let sourceArg: string | null = null;
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliError(`Unknown flag: ${arg}\n${getSkillsInstallUsage()}`);
    }

    if (sourceArg !== null) {
      throw new CliError(
        `Expected at most one source argument, but received multiple.\n${getSkillsInstallUsage()}`,
      );
    }

    sourceArg = arg;
  }

  return {
    sourceArg,
    force,
  };
}

export function resolveSkillInstallPaths(cwd: string, sourceDir: string): SkillInstallPaths {
  const resolvedSourceDir = path.resolve(sourceDir);
  const skillName = path.basename(resolvedSourceDir);

  if (!skillName || skillName === "." || skillName === "..") {
    throw new CliError(
      `Skill source is invalid: could not derive a skill name from ${resolvedSourceDir}`,
    );
  }

  const targetRoot = path.join(cwd, ".agents", "skills");
  const targetDir = path.join(targetRoot, skillName);

  return {
    sourceDir: resolvedSourceDir,
    skillName,
    targetRoot,
    targetDir,
  };
}

export async function validateSkillSource(sourceDir: string): Promise<void> {
  const sourceStats = await safeStat(sourceDir);

  if (!sourceStats) {
    throw new CliError(`Skill source does not exist: ${sourceDir}`);
  }

  if (!sourceStats.isDirectory()) {
    throw new CliError(`Skill source must be a directory: ${sourceDir}`);
  }

  const skillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);

  if (!(await pathExists(skillMarkdownPath))) {
    throw new CliError(
      `Skill source is invalid: ${SKILL_MARKDOWN_FILE} was not found in ${sourceDir}`,
    );
  }
}

export async function listBundledSkills(): Promise<BundledSkill[]> {
  const skillsRoot = await resolveBundledSkillsRoot();
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: BundledSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDir = path.join(skillsRoot, entry.name);

    if (!(await pathExists(path.join(sourceDir, SKILL_MARKDOWN_FILE)))) {
      continue;
    }

    skills.push({
      name: entry.name,
      description: await readBundledSkillDescription(sourceDir),
      sourceDir,
    });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveInstallSources(
  cwd: string,
  sourceArg: string | null,
): Promise<ResolvedInstallSources> {
  const bundledSkills = await listBundledSkills();

  if (bundledSkills.length === 0) {
    throw new CliError("No bundled skills are available to install.");
  }

  if (!sourceArg) {
    return {
      skills: bundledSkills,
      shouldPrompt: true,
    };
  }

  const resolvedLocalSource = path.resolve(cwd, sourceArg);

  if (await pathExists(resolvedLocalSource)) {
    await validateSkillSource(resolvedLocalSource);
    return {
      skills: [
        {
          name: path.basename(resolvedLocalSource),
          description: null,
          sourceDir: resolvedLocalSource,
        },
      ],
      shouldPrompt: false,
    };
  }

  const exactBundledSkill = bundledSkills.find((skill) => skill.name === sourceArg);

  if (exactBundledSkill) {
    return {
      skills: [exactBundledSkill],
      shouldPrompt: false,
    };
  }

  return {
    skills: bundledSkills,
    shouldPrompt: true,
  };
}

export async function installSkillFromDirectory(
  input: InstallSkillFromDirectoryInput,
): Promise<InstallSkillFromDirectoryResult> {
  const { sourceDir, skillName, targetRoot, targetDir } = resolveSkillInstallPaths(
    input.cwd,
    input.sourceDir,
  );

  await validateSkillSource(sourceDir);

  if (sourceDir === targetDir) {
    throw new CliError(`Skill source and destination are the same path: ${sourceDir}`);
  }

  if (await pathExists(targetDir)) {
    if (!input.force) {
      throw new CliError(
        `Skill "${skillName}" is already installed at ${targetDir}. Re-run with --force to replace it.`,
      );
    }

    await rm(targetDir, { recursive: true, force: true });
  }

  await mkdir(targetRoot, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    errorOnExist: false,
    force: true,
  });

  return {
    skillName,
    targetDir,
  };
}

async function resolveBundledSkillsRoot(): Promise<string> {
  const overriddenRoot = process.env.BLYP_CLI_SKILLS_DIR;

  if (overriddenRoot) {
    return path.resolve(overriddenRoot);
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), "..", "..", "skills");
}

async function readBundledSkillDescription(sourceDir: string): Promise<string | null> {
  const skillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
  const contents = await readFile(skillMarkdownPath, "utf8");
  const frontmatterMatch = contents.match(/^---\s*\n([\s\S]*?)\n---/);

  if (!frontmatterMatch?.[1]) {
    return null;
  }

  const descriptionLine = frontmatterMatch[1]
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("description:"));

  if (!descriptionLine) {
    return null;
  }

  return descriptionLine.replace(/^description:\s*/, "").replace(/^['"]|['"]$/g, "").trim();
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
