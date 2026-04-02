import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const smokeRoot = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-packaged-studio-"));

let studioProcess = null;

try {
  const tarballPath = await packCliPackage(smokeRoot);
  const unpackRoot = path.join(smokeRoot, "unpacked");
  await mkdir(unpackRoot, { recursive: true });
  await runCommand("tar", ["-xzf", tarballPath, "-C", unpackRoot], { cwd: packageRoot });

  const installedPackageRoot = path.join(unpackRoot, "package");
  await rewritePackageJsonForProductionInstall(installedPackageRoot);
  await runCommand("npm", ["install", "--omit=dev"], { cwd: installedPackageRoot });

  const projectRoot = path.join(smokeRoot, "project");
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "blyp-cli-smoke-project", private: true }, null, 2),
  );

  const port = await getAvailablePort();
  const logs = createLogCollector();

  studioProcess = spawn(process.execPath, ["dist/studio-host.js"], {
    cwd: installedPackageRoot,
    env: {
      ...process.env,
      BLYPQ_STUDIO_HOST: "127.0.0.1",
      BLYPQ_STUDIO_PORT: `${port}`,
      BLYPQ_STUDIO_TARGET: projectRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  studioProcess.stdout?.on("data", (chunk) => {
    logs.append(chunk);
  });
  studioProcess.stderr?.on("data", (chunk) => {
    logs.append(chunk);
  });

  const studioUrl = `http://127.0.0.1:${port}/`;
  await waitForStudio(studioProcess, studioUrl, logs);
  console.log(`Packaged Studio smoke test passed at ${studioUrl}`);
} finally {
  if (studioProcess && studioProcess.exitCode === null && studioProcess.signalCode === null) {
    studioProcess.kill("SIGINT");
    await waitForExit(studioProcess).catch(() => {});
  }

  await rm(smokeRoot, { recursive: true, force: true });
}

async function packCliPackage(packDestination) {
  const { stdout } = await runCommand("npm", ["pack", "--json", "--pack-destination", packDestination], {
    cwd: packageRoot,
  });
  const payload = parsePackJson(stdout);

  if (!Array.isArray(payload) || payload.length === 0 || typeof payload[0]?.filename !== "string") {
    throw new Error(`Unexpected npm pack output: ${stdout}`);
  }

  return path.join(packDestination, payload[0].filename);
}

function parsePackJson(stdout) {
  const match = stdout.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);

  if (!match) {
    throw new Error(`Could not find npm pack JSON output.\n${stdout}`);
  }

  return JSON.parse(match[1]);
}

async function rewritePackageJsonForProductionInstall(installedPackageRoot) {
  const packageJsonPath = path.join(installedPackageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  delete packageJson.devDependencies;
  delete packageJson.packageManager;

  await writeFile(`${packageJsonPath}`, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function waitForStudio(child, studioUrl, logs) {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const output = logs.read();

    if (output.includes("ERR_MODULE_NOT_FOUND")) {
      throw new Error(`Packaged Studio failed with ERR_MODULE_NOT_FOUND:\n${output}`);
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Packaged Studio exited before responding. Exit code: ${child.exitCode ?? "null"}, signal: ${child.signalCode ?? "null"}.\n${output}`,
      );
    }

    try {
      const response = await fetch(studioUrl, {
        signal: AbortSignal.timeout(2_000),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the timeout is reached or the process exits.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for packaged Studio to respond.\n${logs.read()}`);
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Could not determine an available port."));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function createLogCollector() {
  let buffer = "";

  return {
    append(chunk) {
      buffer += chunk.toString();

      if (buffer.length > 20_000) {
        buffer = buffer.slice(-20_000);
      }
    },
    read() {
      return buffer;
    },
  };
}

async function runCommand(command, args, options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code ?? "null"}${signal ? ` (signal ${signal})` : ""}.\n${stderr || stdout}`,
        ),
      );
    });
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve, reject) => {
    child.once("exit", () => {
      resolve();
    });
    child.once("error", reject);
  });
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
