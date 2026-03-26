import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, cp, mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliError } from "./errors.js";

const SKILL_MARKDOWN_FILE = "SKILL.md";
const DEFAULT_SKILLS_REPO = "https://github.com/Blyphq/skills.git";
const DEFAULT_SKILLS_BRANCH = "main";

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

export interface RemoteSkill {
  readonly name: string;
  readonly description: string | null;
  readonly sourceDir: string;
  readonly commitSha: string;
}

export interface ResolvedInstallSources {
  readonly skills: readonly RemoteSkill[];
  readonly shouldPrompt: boolean;
  readonly commitSha: string;
  cleanup(): Promise<void>;
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

interface RemoteRepoCheckout {
  readonly repoDir: string;
  readonly commitSha: string;
  readonly repoUrl: string;
  cleanup(): Promise<void>;
}

export function getSkillsInstallUsage(): string {
  return "Usage: blyp skills install [source-or-skill-name|claude] [--force]";
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

export async function listRemoteSkills(): Promise<ResolvedInstallSources> {
  const repo = await fetchRemoteSkillsRepo();
  const entries = await readdir(repo.repoDir, { withFileTypes: true });
  const skills: RemoteSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".git") {
      continue;
    }

    const sourceDir = path.join(repo.repoDir, entry.name);

    if (!(await pathExists(path.join(sourceDir, SKILL_MARKDOWN_FILE)))) {
      continue;
    }

    skills.push({
      name: entry.name,
      description: await readSkillDescription(sourceDir),
      sourceDir,
      commitSha: repo.commitSha,
    });
  }

  if (skills.length === 0) {
    await repo.cleanup();
    throw new CliError(
      `No valid skills were found in ${repo.repoUrl} at ${repo.commitSha.slice(0, 7)}.`,
    );
  }

  return {
    skills: skills.sort((left, right) => left.name.localeCompare(right.name)),
    shouldPrompt: true,
    commitSha: repo.commitSha,
    cleanup: repo.cleanup,
  };
}

export async function resolveInstallSources(
  sourceArg: string | null,
): Promise<ResolvedInstallSources> {
  const remoteSkills = await listRemoteSkills();

  if (!sourceArg) {
    return remoteSkills;
  }

  if (looksLikeLocalPath(sourceArg)) {
    await remoteSkills.cleanup();
    throw new CliError(
      `Local skill paths are no longer supported. Use a skill name from Blyphq/skills instead of "${sourceArg}".`,
    );
  }

  const exactRemoteSkill = remoteSkills.skills.find((skill) => skill.name === sourceArg);

  if (!exactRemoteSkill) {
    const availableSkills = remoteSkills.skills.map((skill) => skill.name).join(", ");
    await remoteSkills.cleanup();
    throw new CliError(
      `Skill "${sourceArg}" was not found in Blyphq/skills. Available skills: ${availableSkills}`,
    );
  }

  return {
    skills: [exactRemoteSkill],
    shouldPrompt: false,
    commitSha: remoteSkills.commitSha,
    cleanup: remoteSkills.cleanup,
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

export async function fetchRemoteSkillsRepo(): Promise<RemoteRepoCheckout> {
  const repoUrl = getSkillsRepoUrl();
  const branch = getSkillsRepoBranch();
  const commitSha = await resolveRemoteSkillRepoHead(repoUrl, branch);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-skills-"));
  const repoDir = path.join(tempRoot, "repo");

  try {
    await runGitCommand(["clone", "--depth", "1", "--branch", branch, repoUrl, repoDir], {
      failureMessage: `Failed to download skills from ${repoUrl}. Check your network access to GitHub and try again.`,
    });
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    repoDir,
    commitSha,
    repoUrl,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export async function resolveRemoteSkillRepoHead(
  repoUrl = getSkillsRepoUrl(),
  branch = getSkillsRepoBranch(),
): Promise<string> {
  const output = await runGitCommand(["ls-remote", repoUrl, `refs/heads/${branch}`], {
    failureMessage: `Failed to reach ${repoUrl} to resolve the latest skills revision. Check your network access to GitHub and try again.`,
  });
  const commitSha = output.stdout.split(/\s+/)[0]?.trim();

  if (!commitSha) {
    throw new CliError(`Failed to resolve the latest ${branch} revision for ${repoUrl}.`);
  }

  return commitSha;
}

function getSkillsRepoUrl(): string {
  return process.env.BLYP_CLI_SKILLS_REPO?.trim() || DEFAULT_SKILLS_REPO;
}

function getSkillsRepoBranch(): string {
  return process.env.BLYP_CLI_SKILLS_BRANCH?.trim() || DEFAULT_SKILLS_BRANCH;
}

function getGitBinary(): string {
  return process.env.BLYP_CLI_GIT_BIN?.trim() || "git";
}

function looksLikeLocalPath(sourceArg: string): boolean {
  return (
    sourceArg.startsWith(".") ||
    sourceArg.startsWith("/") ||
    sourceArg.includes(path.sep) ||
    sourceArg.includes("\\")
  );
}

async function readSkillDescription(sourceDir: string): Promise<string | null> {
  const skillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
  const contents = await readFile(skillMarkdownPath, "utf8");
  const frontmatterMatch = contents.match(/^---\s*\n([\s\S]*?)\n---/);

  if (!frontmatterMatch?.[1]) {
    return null;
  }

  return parseFrontmatterDescription(frontmatterMatch[1]);
}

function parseFrontmatterDescription(frontmatter: string): string | null {
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line?.trim().startsWith("description:")) {
      continue;
    }

    const value = line.replace(/^description:\s*/, "").trim();

    if (!value) {
      return null;
    }

    if (value !== ">" && value !== "|") {
      return value.replace(/^['"]|['"]$/g, "").trim() || null;
    }

    const descriptionLines: string[] = [];

    for (let nestedIndex = index + 1; nestedIndex < lines.length; nestedIndex += 1) {
      const nestedLine = lines[nestedIndex];

      if (!nestedLine?.startsWith(" ")) {
        break;
      }

      descriptionLines.push(nestedLine.trim());
    }

    const description = descriptionLines.join(" ").replace(/\s+/g, " ").trim();
    return description || null;
  }

  return null;
}

async function runGitCommand(
  args: readonly string[],
  input: { readonly failureMessage: string; readonly cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const gitBinary = getGitBinary();

  return await new Promise((resolve, reject) => {
    const child = spawn(gitBinary, args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new CliError(
            `Git is required to install skills from Blyphq/skills, but "${gitBinary}" was not found in PATH.`,
          ),
        );
        return;
      }

      reject(new CliError(input.failureMessage));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(
        new CliError(details ? `${input.failureMessage}\n${details}` : input.failureMessage),
      );
    });
  });
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
