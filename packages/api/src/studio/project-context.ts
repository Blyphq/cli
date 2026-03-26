import { readFile } from "node:fs/promises";
import path from "node:path";

const MANAGED_START = "<!-- blyp:claude-md:start -->";
const MANAGED_END = "<!-- blyp:claude-md:end -->";

export interface StudioProjectClaudeMd {
  exists: boolean;
  content: string | null;
  managedContent: string | null;
}

export async function loadProjectClaudeMd(projectPath: string): Promise<StudioProjectClaudeMd> {
  const filePath = path.join(projectPath, "CLAUDE.md");

  try {
    const content = await readFile(filePath, "utf8");
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      return {
        exists: false,
        content: null,
        managedContent: null,
      };
    }

    return {
      exists: true,
      content,
      managedContent: extractManagedContent(content),
    };
  } catch {
    return {
      exists: false,
      content: null,
      managedContent: null,
    };
  }
}

function extractManagedContent(content: string): string | null {
  const startIndex = content.indexOf(MANAGED_START);
  const endIndex = content.indexOf(MANAGED_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const managed = content
    .slice(startIndex + MANAGED_START.length, endIndex)
    .trim();

  return managed.length > 0 ? managed : null;
}
