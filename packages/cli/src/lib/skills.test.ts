import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CliError } from "./errors.js";
import {
  getSkillsInstallUsage,
  installSkillFromDirectory,
  listBundledSkills,
  parseSkillsInstallArgs,
  resolveInstallSources,
  resolveSkillInstallPaths,
  validateSkillSource,
} from "./skills.js";

const tempDirs: string[] = [];
const originalSkillsDir = process.env.BLYP_CLI_SKILLS_DIR;

beforeEach(() => {
  delete process.env.BLYP_CLI_SKILLS_DIR;
});

afterEach(async () => {
  if (originalSkillsDir) {
    process.env.BLYP_CLI_SKILLS_DIR = originalSkillsDir;
  } else {
    delete process.env.BLYP_CLI_SKILLS_DIR;
  }

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

describe("bundled skills", () => {
  it("lists bundled skills from the configured skills directory", async () => {
    const skillsDir = await createTempDir();
    await createSkillSource(skillsDir, "ai-sdk", "Current APIs only");
    await createSkillSource(skillsDir, "frontend-design", "Design systems");
    process.env.BLYP_CLI_SKILLS_DIR = skillsDir;

    const skills = await listBundledSkills();

    expect(skills.map((skill) => skill.name)).toEqual(["ai-sdk", "frontend-design"]);
    expect(skills[0]?.description).toBe("Example skill");
  });

  it("resolves a local path before falling back to bundled skills", async () => {
    const cwd = await createTempDir();
    const localSkillDir = await createSkillSource(cwd, "ai-sdk");
    const bundledDir = await createTempDir();
    await createSkillSource(bundledDir, "ai-sdk");
    process.env.BLYP_CLI_SKILLS_DIR = bundledDir;

    const skills = await resolveInstallSources(cwd, "./ai-sdk");

    expect(skills.shouldPrompt).toBe(false);
    expect(skills.skills).toHaveLength(1);
    expect(skills.skills[0]?.sourceDir).toBe(localSkillDir);
  });

  it("falls back to bundled skill name lookup", async () => {
    const cwd = await createTempDir();
    const bundledDir = await createTempDir();
    const bundledSkillDir = await createSkillSource(bundledDir, "ai-sdk");
    process.env.BLYP_CLI_SKILLS_DIR = bundledDir;

    const skills = await resolveInstallSources(cwd, "ai-sdk");

    expect(skills.shouldPrompt).toBe(false);
    expect(skills.skills).toHaveLength(1);
    expect(skills.skills[0]?.sourceDir).toBe(bundledSkillDir);
  });

  it("returns the bundled skill list when the provided source cannot be resolved", async () => {
    const cwd = await createTempDir();
    const bundledDir = await createTempDir();
    await createSkillSource(bundledDir, "ai-sdk");
    await createSkillSource(bundledDir, "frontend-design");
    process.env.BLYP_CLI_SKILLS_DIR = bundledDir;

    const skills = await resolveInstallSources(cwd, "./missing-skill");

    expect(skills.shouldPrompt).toBe(true);
    expect(skills.skills.map((skill) => skill.name)).toEqual(["ai-sdk", "frontend-design"]);
  });
});

describe("skills install argument parsing", () => {
  it("parses an optional source argument without force", () => {
    expect(parseSkillsInstallArgs(["./ai-sdk"])).toEqual({
      sourceArg: "./ai-sdk",
      force: false,
    });
    expect(parseSkillsInstallArgs([])).toEqual({
      sourceArg: null,
      force: false,
    });
  });

  it("parses --force before or after the source", () => {
    expect(parseSkillsInstallArgs(["--force", "./ai-sdk"])).toEqual({
      sourceArg: "./ai-sdk",
      force: true,
    });
    expect(parseSkillsInstallArgs(["./ai-sdk", "--force"])).toEqual({
      sourceArg: "./ai-sdk",
      force: true,
    });
  });

  it("fails on unknown flags", () => {
    expect(() => parseSkillsInstallArgs(["./ai-sdk", "--unknown"])).toThrowError(
      new CliError(`Unknown flag: --unknown\n${getSkillsInstallUsage()}`),
    );
  });

  it("fails on extra positional arguments", () => {
    expect(() => parseSkillsInstallArgs(["./one", "./two"])).toThrowError(
      new CliError(
        `Expected at most one source argument, but received multiple.\n${getSkillsInstallUsage()}`,
      ),
    );
  });
});

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
