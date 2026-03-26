import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CliError } from "./errors.js";
import {
  getSkillsInstallUsage,
  installSkillFromDirectory,
  listRemoteSkills,
  parseSkillsInstallArgs,
  resolveInstallSources,
  resolveRemoteSkillRepoHead,
  resolveSkillInstallPaths,
  validateSkillSource,
} from "./skills.js";

const tempDirs: string[] = [];
const originalRepo = process.env.BLYP_CLI_SKILLS_REPO;
const originalBranch = process.env.BLYP_CLI_SKILLS_BRANCH;
const originalGitBin = process.env.BLYP_CLI_GIT_BIN;

beforeEach(() => {
  delete process.env.BLYP_CLI_SKILLS_REPO;
  delete process.env.BLYP_CLI_SKILLS_BRANCH;
  delete process.env.BLYP_CLI_GIT_BIN;
});

afterEach(async () => {
  restoreEnv("BLYP_CLI_SKILLS_REPO", originalRepo);
  restoreEnv("BLYP_CLI_SKILLS_BRANCH", originalBranch);
  restoreEnv("BLYP_CLI_GIT_BIN", originalGitBin);

  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("skills installer", () => {
  it("installs a valid skill into .agents/skills", async () => {
    const cwd = await createTempDir();
    const sourceDir = await createSkillSource(cwd, "ai-sdk");

    const result = await installSkillFromDirectory({
      cwd,
      sourceDir,
      force: false,
    });

    expect(result.skillName).toBe("ai-sdk");
    expect(result.targetDir).toBe(path.join(cwd, ".agents", "skills", "ai-sdk"));

    const installedSkill = await readFile(
      path.join(result.targetDir, "references", "common-errors.md"),
      "utf8",
    );
    const installedSkillMarkdown = await readFile(path.join(result.targetDir, "SKILL.md"), "utf8");

    expect(installedSkill).toContain("Current APIs only");
    expect(installedSkillMarkdown).toContain("name: ai-sdk");
  });

  it("creates .agents/skills when the destination root does not exist", async () => {
    const cwd = await createTempDir();
    const sourceDir = await createSkillSource(cwd, "frontend-design");
    const paths = resolveSkillInstallPaths(cwd, sourceDir);

    await installSkillFromDirectory({
      cwd,
      sourceDir,
      force: false,
    });

    await expect(readFile(path.join(paths.targetDir, "SKILL.md"), "utf8")).resolves.toContain(
      "frontend-design",
    );
  });

  it("fails when the source path does not exist", async () => {
    const cwd = await createTempDir();

    await expect(
      installSkillFromDirectory({
        cwd,
        sourceDir: path.join(cwd, "missing-skill"),
        force: false,
      }),
    ).rejects.toThrowError(new CliError(`Skill source does not exist: ${path.join(cwd, "missing-skill")}`));
  });

  it("fails when the source path is a file", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(cwd, "skill.txt");
    await writeFile(filePath, "not a directory", "utf8");

    await expect(validateSkillSource(filePath)).rejects.toThrowError(
      new CliError(`Skill source must be a directory: ${filePath}`),
    );
  });

  it("fails when SKILL.md is missing", async () => {
    const cwd = await createTempDir();
    const sourceDir = path.join(cwd, "broken-skill");
    await mkdir(path.join(sourceDir, "references"), { recursive: true });

    await expect(validateSkillSource(sourceDir)).rejects.toThrowError(
      new CliError(`Skill source is invalid: SKILL.md was not found in ${sourceDir}`),
    );
  });

  it("fails when the destination exists without --force", async () => {
    const cwd = await createTempDir();
    const sourceDir = await createSkillSource(cwd, "ai-sdk");

    await installSkillFromDirectory({
      cwd,
      sourceDir,
      force: false,
    });

    await expect(
      installSkillFromDirectory({
        cwd,
        sourceDir,
        force: false,
      }),
    ).rejects.toThrowError(
      new CliError(
        `Skill "ai-sdk" is already installed at ${path.join(cwd, ".agents", "skills", "ai-sdk")}. Re-run with --force to replace it.`,
      ),
    );
  });

  it("replaces the destination when --force is set", async () => {
    const cwd = await createTempDir();
    const sourceDir = await createSkillSource(cwd, "ai-sdk", "first version");

    await installSkillFromDirectory({
      cwd,
      sourceDir,
      force: false,
    });

    await writeFile(path.join(sourceDir, "references", "common-errors.md"), "second version", "utf8");

    await installSkillFromDirectory({
      cwd,
      sourceDir,
      force: true,
    });

    await expect(
      readFile(path.join(cwd, ".agents", "skills", "ai-sdk", "references", "common-errors.md"), "utf8"),
    ).resolves.toBe("second version");
  });
});

describe("remote skills", () => {
  it("lists remote skills from the configured git repo", async () => {
    const repoDir = await createRemoteSkillsRepo([
      { directory: "studio-debugger", skillName: "blyp-studio-debugger", description: "Debug traces" },
      { directory: "runtime-targeting", skillName: "blyp-runtime-targeting", description: "Runtime guides" },
      { directory: "docs-only", includeSkillMarkdown: false },
    ]);

    process.env.BLYP_CLI_SKILLS_REPO = repoDir;

    const result = await listRemoteSkills();

    try {
      expect(result.shouldPrompt).toBe(true);
      expect(result.skills.map((skill) => skill.name)).toEqual([
        "runtime-targeting",
        "studio-debugger",
      ]);
      expect(result.skills[0]?.description).toBe("Runtime guides");
      expect(result.skills[0]?.commitSha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await result.cleanup();
    }
  });

  it("resolves a named skill from the remote repo", async () => {
    const repoDir = await createRemoteSkillsRepo([
      { directory: "studio-debugger", skillName: "blyp-studio-debugger", description: "Debug traces" },
      { directory: "trace-annotation", skillName: "blyp-trace-annotation", description: "Annotate traces" },
    ]);
    process.env.BLYP_CLI_SKILLS_REPO = repoDir;

    const result = await resolveInstallSources("trace-annotation");

    try {
      expect(result.shouldPrompt).toBe(false);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("trace-annotation");
      expect(result.skills[0]?.sourceDir).toContain(`${path.sep}trace-annotation`);
    } finally {
      await result.cleanup();
    }
  });

  it("rejects local path arguments", async () => {
    const repoDir = await createRemoteSkillsRepo([
      { directory: "studio-debugger", skillName: "blyp-studio-debugger", description: "Debug traces" },
    ]);
    process.env.BLYP_CLI_SKILLS_REPO = repoDir;

    await expect(resolveInstallSources("./studio-debugger")).rejects.toThrowError(
      new CliError(
        'Local skill paths are no longer supported. Use a skill name from Blyphq/skills instead of "./studio-debugger".',
      ),
    );
  });

  it("fails when the named remote skill does not exist", async () => {
    const repoDir = await createRemoteSkillsRepo([
      { directory: "studio-debugger", skillName: "blyp-studio-debugger", description: "Debug traces" },
      { directory: "trace-annotation", skillName: "blyp-trace-annotation", description: "Annotate traces" },
    ]);
    process.env.BLYP_CLI_SKILLS_REPO = repoDir;

    await expect(resolveInstallSources("missing-skill")).rejects.toThrowError(
      new CliError(
        'Skill "missing-skill" was not found in Blyphq/skills. Available skills: studio-debugger, trace-annotation',
      ),
    );
  });

  it("fails when the remote repo cannot be cloned", async () => {
    process.env.BLYP_CLI_SKILLS_REPO = path.join(os.tmpdir(), "blyp-cli-missing-repo");

    await expect(listRemoteSkills()).rejects.toThrowError(/Failed to reach .* latest skills revision/);
  });

  it("fails when git is not available", async () => {
    process.env.BLYP_CLI_GIT_BIN = "git-does-not-exist";

    await expect(resolveRemoteSkillRepoHead()).rejects.toThrowError(
      new CliError(
        'Git is required to install skills from Blyphq/skills, but "git-does-not-exist" was not found in PATH.',
      ),
    );
  });
});

describe("skills install argument parsing", () => {
  it("parses an optional source argument without force", () => {
    expect(parseSkillsInstallArgs(["studio-debugger"])).toEqual({
      sourceArg: "studio-debugger",
      force: false,
    });
    expect(parseSkillsInstallArgs(["claude"])).toEqual({
      sourceArg: "claude",
      force: false,
    });
    expect(parseSkillsInstallArgs([])).toEqual({
      sourceArg: null,
      force: false,
    });
  });

  it("parses --force before or after the source", () => {
    expect(parseSkillsInstallArgs(["--force", "studio-debugger"])).toEqual({
      sourceArg: "studio-debugger",
      force: true,
    });
    expect(parseSkillsInstallArgs(["studio-debugger", "--force"])).toEqual({
      sourceArg: "studio-debugger",
      force: true,
    });
  });

  it("fails on unknown flags", () => {
    expect(() => parseSkillsInstallArgs(["studio-debugger", "--unknown"])).toThrowError(
      new CliError(`Unknown flag: --unknown\n${getSkillsInstallUsage()}`),
    );
  });

  it("fails on extra positional arguments", () => {
    expect(() => parseSkillsInstallArgs(["one", "two"])).toThrowError(
      new CliError(
        `Expected at most one source argument, but received multiple.\n${getSkillsInstallUsage()}`,
      ),
    );
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-skills-"));
  tempDirs.push(directory);
  return directory;
}

async function createSkillSource(
  parentDir: string,
  name: string,
  referenceContent = "Current APIs only",
): Promise<string> {
  const sourceDir = path.join(parentDir, name);
  const referencesDir = path.join(sourceDir, "references");

  await mkdir(referencesDir, { recursive: true });
  await writeFile(
    path.join(sourceDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Example skill\n---\n`,
    "utf8",
  );
  await writeFile(path.join(referencesDir, "common-errors.md"), referenceContent, "utf8");

  return sourceDir;
}

async function createRemoteSkillsRepo(
  skills: Array<{
    readonly directory: string;
    readonly skillName?: string;
    readonly description?: string;
    readonly includeSkillMarkdown?: boolean;
  }>,
): Promise<string> {
  const repoDir = await createTempDir();

  await runGit(["init", "-b", "main"], repoDir);
  await runGit(["config", "user.name", "blyp-cli-tests"], repoDir);
  await runGit(["config", "user.email", "blyp-cli@example.com"], repoDir);

  for (const skill of skills) {
    const skillDir = path.join(repoDir, skill.directory);
    await mkdir(path.join(skillDir, "references"), { recursive: true });
    await writeFile(
      path.join(skillDir, "references", "common-errors.md"),
      `${skill.directory} reference`,
      "utf8",
    );

    if (skill.includeSkillMarkdown !== false) {
      const skillName = skill.skillName ?? skill.directory;
      const description = skill.description ?? "Example skill";
      await writeFile(
        path.join(skillDir, "SKILL.md"),
        `---\nname: ${skillName}\ndescription: >\n  ${description}\n---\n`,
        "utf8",
      );
    }
  }

  await runGit(["add", "."], repoDir);
  await runGit(["commit", "-m", "Initial skills"], repoDir);

  return repoDir;
}

async function runGit(args: readonly string[], cwd: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
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

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`));
    });
  });
}
