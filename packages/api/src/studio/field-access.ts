import type { StudioNormalizedRecord } from "./types";

export function readString(
  record: StudioNormalizedRecord | Record<string, unknown>,
  paths: readonly string[],
): string | null {
  for (const path of paths) {
    const value = readValue(record, [path]);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function readNumber(
  record: StudioNormalizedRecord | Record<string, unknown>,
  paths: readonly string[],
): number | null {
  for (const path of paths) {
    const value = readValue(record, [path]);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function readBoolean(
  record: StudioNormalizedRecord | Record<string, unknown>,
  paths: readonly string[],
): boolean | null {
  for (const path of paths) {
    const value = readValue(record, [path]);
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

export function readValue(
  record: StudioNormalizedRecord | Record<string, unknown>,
  paths: readonly string[],
): unknown {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function getNestedValue(
  value: StudioNormalizedRecord | Record<string, unknown> | unknown,
  dottedKey: string,
): unknown {
  return dottedKey.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[part];
  }, value);
}
