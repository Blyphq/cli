import { spinner } from "@clack/prompts";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import type { CommandContext, CommandDefinition } from "../types.js";
import { openBrowser } from "../lib/browser.js";
import { CliError } from "../lib/errors.js";
import {
  getStudioUrl,
  resolvePackagedStudioPaths,
  resolveWebAppDir,
  resolveWorkspaceRoot,
} from "../lib/runtime.js";
import { ensureStudioAiSetup } from "../lib/studio-ai.js";
import { getStudioHostScriptPath } from "../lib/studio-server.js";
import {
  showInfo,
  showNote,
  showSuccess,
  showWarning,
} from "../lib/output.js";

const STUDIO_STARTUP_TIMEOUT_MS = 30_000;
const STUDIO_POLL_INTERVAL_MS = 500;
const STUDIO_REQUEST_TIMEOUT_MS = 1_500;

export const studioCommand: CommandDefinition = {
  name: "studio",
  description: "Start or manage the local Studio workflow.",
  usage: "blyphq studio [targetPath]",
  async run(context: CommandContext): Promise<void> {
    const targetProjectPath = path.resolve(context.cwd, context.argv[0] ?? context.cwd);

    const relativeToCwd = path.relative(context.cwd, targetProjectPath);
    if (relativeToCwd.startsWith("..") || path.isAbsolute(relativeToCwd)) {
      throw new CliError(
        "The target path must be inside the current directory. Path traversal (e.g. ..) is not allowed.",
      );
    }

    await ensureStudioAiSetup(targetProjectPath);

    const studioUrl = getStudioUrl(targetProjectPath);
    const status = spinner();
    const workspaceRoot = await resolveWorkspaceRoot(context.cwd);
    const webAppDir = workspaceRoot ? await resolveWebAppDir(context.cwd) : null;
    const packagedStudio = await resolvePackagedStudioPaths();

    status.start("Checking Studio frontend");
    const frontendIsRunning = await isUrlReachable(studioUrl);

    if (frontendIsRunning) {
      status.stop("Studio frontend is already running");
      showInfo(`Inspecting ${targetProjectPath}`);
      await openStudioBrowser(studioUrl);
      return;
    }

    const child = startStudioProcess({
      targetProjectPath,
      webAppDir,
      packagedStudioAvailable: packagedStudio !== null,
      status,
    });

    try {
      const ready = await waitForStudioReadyOrError(
        studioUrl,
        child,
        STUDIO_STARTUP_TIMEOUT_MS,
      );

      if (!ready) {
        child.kill("SIGINT");
        throw new CliError("Studio frontend did not become ready within 30s.");
      }

      status.stop("Studio frontend is ready");
      await openStudioBrowser(studioUrl);
      showNote(
        "Studio",
        `Inspecting ${targetProjectPath}\nFrontend running at ${studioUrl}\nPress Ctrl-C to stop it.`,
      );
      await forwardSignalsUntilExit(child);
    } catch (error) {
      if (!child.killed && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGINT");
      }

      throw error;
    }
  },
};

function startStudioProcess(input: {
  readonly targetProjectPath: string;
  readonly webAppDir: string | null;
  readonly packagedStudioAvailable: boolean;
  readonly status: ReturnType<typeof spinner>;
}) {
  if (input.webAppDir) {
    input.status.message("Starting Studio frontend");
    return spawn("bun", ["run", "dev"], {
      cwd: input.webAppDir,
      env: {
        ...process.env,
        BLYPQ_STUDIO_TARGET: input.targetProjectPath,
      },
      stdio: "inherit",
    });
  }

  if (!input.packagedStudioAvailable) {
    throw new CliError(
      "Studio is not available from this installation. Reinstall the CLI package or run the command from the blyp-cli repo.",
    );
  }

  input.status.message("Starting packaged Studio");
  return spawn(process.execPath, [getStudioHostScriptPath()], {
    env: {
      ...process.env,
      BLYPQ_STUDIO_TARGET: input.targetProjectPath,
      BLYPQ_STUDIO_PORT: "3003",
      BLYPQ_STUDIO_HOST: "127.0.0.1",
    },
    stdio: "inherit",
  });
}

async function openStudioBrowser(studioUrl: string): Promise<void> {
  try {
    await openBrowser(studioUrl);
    showSuccess(`Opened Studio in your browser at ${studioUrl}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Browser open failed for an unknown reason.";
    showWarning(`Studio is ready, but the browser could not be opened automatically: ${message}`);
    showNote("Studio URL", studioUrl);
  }
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(STUDIO_REQUEST_TIMEOUT_MS),
    });
    return response.ok || response.status > 0;
  } catch {
    return false;
  }
}

async function waitForStudioReady(
  studioUrl: string,
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isUrlReachable(studioUrl)) {
      return true;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      throw new CliError("Studio frontend exited before becoming ready.");
    }

    await sleep(STUDIO_POLL_INTERVAL_MS);
  }

  return false;
}

async function waitForStudioReadyOrError(
  studioUrl: string,
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<boolean> {
  let cleanup = () => {};

  const spawnErrorPromise = new Promise<never>((_, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new CliError("Bun is required to start Studio and must be available on PATH."));
        return;
      }

      reject(error);
    };

    child.once("error", handleError);
    cleanup = () => {
      child.off("error", handleError);
    };
  });

  try {
    return await Promise.race([
      waitForStudioReady(studioUrl, child, timeoutMs),
      spawnErrorPromise,
    ]);
  } finally {
    cleanup();
  }
}

async function forwardSignalsUntilExit(child: ReturnType<typeof spawn>): Promise<void> {
  let forwarded = false;

  const forwardSignal = () => {
    if (forwarded) {
      return;
    }

    forwarded = true;

    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGINT");
    }
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  const [exitCode, signalCode] = await once(child, "exit");

  process.off("SIGINT", forwardSignal);
  process.off("SIGTERM", forwardSignal);

  if (typeof exitCode === "number" && exitCode !== 0) {
    throw new CliError(`Studio frontend exited with code ${exitCode}.`, exitCode);
  }

  if (typeof signalCode === "string" && signalCode !== "SIGINT") {
    throw new CliError(`Studio frontend exited from signal ${signalCode}.`);
  }

  showInfo("Studio frontend stopped.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
