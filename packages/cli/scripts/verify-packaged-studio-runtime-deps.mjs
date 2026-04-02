import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const serverRoot = path.join(packageRoot, "studio", "server");
const packageJsonPath = path.join(packageRoot, "package.json");

const STATIC_IMPORT_PATTERN = /^\s*import\s+(?:.+?\s+from\s+)?["']([^"']+)["'];?/gm;
const DYNAMIC_IMPORT_PATTERN = /import\(\s*["']([^"']+)["']\s*\)/g;

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const runtimeDependencies = new Set(Object.keys(packageJson.dependencies ?? {}));
const jsFiles = await collectJavaScriptFiles(serverRoot);
const imports = new Map();

for (const filePath of jsFiles) {
  const contents = await readFile(filePath, "utf8");

  for (const specifier of collectSpecifiers(contents)) {
    const packageName = normalizeToPackageName(specifier);

    if (!packageName) {
      continue;
    }

    const occurrences = imports.get(packageName) ?? [];
    occurrences.push({
      filePath,
      specifier,
    });
    imports.set(packageName, occurrences);
  }
}

const missingPackages = [...imports.entries()]
  .filter(([packageName]) => !runtimeDependencies.has(packageName))
  .sort(([left], [right]) => left.localeCompare(right));

if (missingPackages.length > 0) {
  console.error("Packaged Studio server imports undeclared runtime dependencies:");

  for (const [packageName, occurrences] of missingPackages) {
    console.error(`- ${packageName}`);

    for (const occurrence of occurrences) {
      const relativeFilePath = path.relative(packageRoot, occurrence.filePath);
      console.error(`  ${relativeFilePath} -> ${occurrence.specifier}`);
    }
  }

  process.exit(1);
}

console.log(
  `Verified packaged Studio runtime dependencies for ${imports.size} external package${imports.size === 1 ? "" : "s"}.`,
);

async function collectJavaScriptFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await collectJavaScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function collectSpecifiers(contents) {
  const specifiers = [];

  for (const match of contents.matchAll(STATIC_IMPORT_PATTERN)) {
    specifiers.push(match[1]);
  }

  for (const match of contents.matchAll(DYNAMIC_IMPORT_PATTERN)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function normalizeToPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("file:") ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  ) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }

  return specifier.split("/")[0];
}
