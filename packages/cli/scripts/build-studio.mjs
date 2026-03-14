import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(cliDir, "..", "..");
const webDir = path.join(repoRoot, "apps", "web");
const webDistDir = path.join(webDir, "dist");
const studioDir = path.join(cliDir, "studio");

await runBunBuild(webDir);
await rm(studioDir, { recursive: true, force: true });
await mkdir(studioDir, { recursive: true });
await cp(path.join(webDistDir, "client"), path.join(studioDir, "client"), {
  recursive: true,
});
await cp(path.join(webDistDir, "server"), path.join(studioDir, "server"), {
  recursive: true,
});

function runBunBuild(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "build"], {
      cwd,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (typeof code === "number" && code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`Studio build exited from signal ${signal}.`));
        return;
      }

      reject(new Error(`Studio build exited with code ${code ?? "unknown"}.`));
    });
  });
}
