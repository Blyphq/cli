import { useEffect, useMemo, useState } from "react";

interface StoredErrorSessionState {
  resolvedAtByFingerprint: Record<string, string>;
  ignoredByFingerprint: Record<string, true>;
  resolvedCollapsed: boolean;
}

const DEFAULT_STATE: StoredErrorSessionState = {
  resolvedAtByFingerprint: {},
  ignoredByFingerprint: {},
  resolvedCollapsed: true,
};

export function useErrorSessionState(projectPath: string) {
  const [state, setState] = useState<StoredErrorSessionState>(DEFAULT_STATE);

  useEffect(() => {
    setState(readState(projectPath));
  }, [projectPath]);

  useEffect(() => {
    writeState(projectPath, state);
  }, [projectPath, state]);

  const api = useMemo(
    () => ({
      state,
      markResolved(fingerprint: string) {
        setState((current) => ({
          ...current,
          resolvedAtByFingerprint: {
            ...current.resolvedAtByFingerprint,
            [fingerprint]: new Date().toISOString(),
          },
          ignoredByFingerprint: omitKey(current.ignoredByFingerprint, fingerprint),
        }));
      },
      ignore(fingerprint: string) {
        setState((current) => ({
          ...current,
          ignoredByFingerprint: {
            ...current.ignoredByFingerprint,
            [fingerprint]: true,
          },
        }));
      },
      unignore(fingerprint: string) {
        setState((current) => ({
          ...current,
          ignoredByFingerprint: omitKey(current.ignoredByFingerprint, fingerprint),
        }));
      },
      reopen(fingerprint: string) {
        setState((current) => ({
          ...current,
          resolvedAtByFingerprint: omitKey(current.resolvedAtByFingerprint, fingerprint),
        }));
      },
      setResolvedCollapsed(next: boolean) {
        setState((current) => ({
          ...current,
          resolvedCollapsed: next,
        }));
      },
    }),
    [state],
  );

  return api;
}

function getStorageKey(projectPath: string): string {
  return `blyp:studio:error-session:${projectPath || "default"}`;
}

function readState(projectPath: string): StoredErrorSessionState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(projectPath));
    if (!raw) {
      return DEFAULT_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<StoredErrorSessionState>;
    return {
      resolvedAtByFingerprint: isRecord(parsed.resolvedAtByFingerprint)
        ? mapStringValues(parsed.resolvedAtByFingerprint)
        : {},
      ignoredByFingerprint: isRecord(parsed.ignoredByFingerprint)
        ? mapTrueValues(parsed.ignoredByFingerprint)
        : {},
      resolvedCollapsed:
        typeof parsed.resolvedCollapsed === "boolean"
          ? parsed.resolvedCollapsed
          : true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(projectPath: string, state: StoredErrorSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getStorageKey(projectPath), JSON.stringify(state));
  } catch {
    // Ignore storage quota/privacy-mode failures; session UI state is best effort.
  }
}

function omitKey<T extends Record<string, unknown>>(value: T, key: string): T {
  const next = { ...value };
  delete next[key];
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapStringValues(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function mapTrueValues(value: Record<string, unknown>): Record<string, true> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] === true)
      .map(([key]) => [key, true]),
  );
}
