import { useEffect, useState } from "react";

import type {
  StudioAuthUiState,
  StudioErrorGroup,
  StudioErrorOccurrence,
  StudioErrorUiState,
  StudioFilters,
  StudioGroupingMode,
  StudioHttpUiState,
  StudioLogEntry,
  StudioSidebarState,
  StudioSectionId,
  StudioSelection,
} from "@/lib/studio";
import { isGroupEntry } from "@/lib/studio";

export const DEFAULT_FILTERS: StudioFilters = {
  level: "",
  type: "",
  search: "",
  fileId: "",
  from: "",
  to: "",
};

export const DEFAULT_ERROR_UI: StudioErrorUiState = {
  view: "grouped",
  sort: "most-recent",
  type: "",
  sourceFile: "",
  sectionTag: "",
  showResolved: false,
  showIgnored: false,
};

export const DEFAULT_HTTP_UI: StudioHttpUiState = {
  method: "",
  statusGroup: "",
  route: "",
  minDurationMs: "",
};

export function useStudioFiltersAndSelection(initialProjectPath: string) {
  const [filters, setFilters] = useState<StudioFilters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [offset, setOffset] = useState(0);
  const [grouping, setGrouping] = useState<StudioGroupingMode>("grouped");
  const [section, setSectionState] = useState<StudioSectionId>("overview");
  const [visitedAtBySection, setVisitedAtBySection] = useState<Record<string, string>>({});
  const [authUi, setAuthUi] = useState<StudioAuthUiState>({
    selectedUserId: null,
    selectedPatternId: null,
  });
  const [errorUi, setErrorUi] = useState<StudioErrorUiState>(DEFAULT_ERROR_UI);
  const [httpUi, setHttpUi] = useState<StudioHttpUiState>(DEFAULT_HTTP_UI);
  const [draftProjectPath, setDraftProjectPath] = useState(initialProjectPath);

  useEffect(() => {
    setDraftProjectPath(initialProjectPath);
    const persisted = readSidebarState(initialProjectPath);
    setSectionState(persisted.selectedSection);
    setVisitedAtBySection(persisted.visitedAtBySection);
    setAuthUi({ selectedUserId: null, selectedPatternId: null });
    setErrorUi(DEFAULT_ERROR_UI);
    setHttpUi(DEFAULT_HTTP_UI);
  }, [initialProjectPath]);

  const setSection = (next: StudioSectionId) => {
    setSectionState(next);
    if (initialProjectPath) {
      const nextVisited = {
        ...visitedAtBySection,
        [next]: new Date().toISOString(),
      };
      setVisitedAtBySection(nextVisited);
      writeSidebarState(initialProjectPath, {
        selectedSection: next,
        visitedAtBySection: nextVisited,
      });
    }
  };

  return {
    filters,
    setFilters,
    selection,
    setSelection,
    offset,
    setOffset,
    grouping,
    setGrouping,
    section,
    setSection,
    visitedAtBySection,
    authUi,
    setAuthUi,
    errorUi,
    setErrorUi,
    httpUi,
    setHttpUi,
    draftProjectPath,
    setDraftProjectPath,
  };
}

function getSidebarStorageKey(projectPath: string): string {
  return `blyp:studio:sidebar:${projectPath || "default"}`;
}

function readSidebarState(projectPath: string): StudioSidebarState {
  if (typeof window === "undefined") {
    return { selectedSection: "overview", visitedAtBySection: {} };
  }

  try {
    const raw = window.localStorage.getItem(getSidebarStorageKey(projectPath));
    if (!raw) {
      return { selectedSection: "overview", visitedAtBySection: {} };
    }
    return parseSidebarState(JSON.parse(raw));
  } catch {
    return { selectedSection: "overview", visitedAtBySection: {} };
  }
}

function writeSidebarState(projectPath: string, value: StudioSidebarState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getSidebarStorageKey(projectPath), JSON.stringify(value));
  } catch {
    // Silently ignore storage errors (e.g. QuotaExceededError)
  }
}

function parseSidebarState(value: unknown): StudioSidebarState {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { selectedSection?: unknown }).selectedSection === "string" &&
    (value as { visitedAtBySection?: unknown }).visitedAtBySection &&
    typeof (value as { visitedAtBySection: unknown }).visitedAtBySection === "object" &&
    !Array.isArray((value as { visitedAtBySection: unknown }).visitedAtBySection)
  ) {
    const visitedAtBySection = Object.fromEntries(
      Object.entries(
        (value as { visitedAtBySection: Record<string, unknown> }).visitedAtBySection,
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );

    return {
      selectedSection: (value as { selectedSection: StudioSidebarState["selectedSection"] }).selectedSection,
      visitedAtBySection,
    };
  }

  return { selectedSection: "overview", visitedAtBySection: {} };
}

export function useSyncSelectionFromEntries(
  entries: StudioLogEntry[],
  selection: StudioSelection,
  setSelection: (s: StudioSelection) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!entries.length) {
      setSelection(null);
      return;
    }

    if (
      !selection ||
      !entries.some((entry) => entry.id === selection.id)
    ) {
      const firstEntry = entries[0];
      if (!firstEntry) {
        setSelection(null);
        return;
      }
      setSelection(
        isGroupEntry(firstEntry)
          ? { kind: "group", id: firstEntry.id }
          : { kind: "record", id: firstEntry.id },
      );
    }
  }, [enabled, entries, selection, setSelection]);
}

export function useSyncErrorSelectionFromEntries(
  entries: Array<StudioErrorGroup | StudioErrorOccurrence>,
  selection: StudioSelection,
  setSelection: (s: StudioSelection) => void,
  groupedView: boolean,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!entries.length) {
      setSelection(null);
      return;
    }

    const hasMatchingSelection = entries.some((entry) =>
      groupedView
        ? entry.kind === "error-group" && entry.fingerprint === selection?.id
        : entry.kind === "occurrence" && entry.id === selection?.id,
    );

    if (
      !selection ||
      (groupedView && selection.kind !== "error-group") ||
      (!groupedView && selection.kind !== "error-occurrence") ||
      !hasMatchingSelection
    ) {
      const firstEntry = entries[0];
      if (!firstEntry) {
        setSelection(null);
        return;
      }

      if (firstEntry.kind === "error-group") {
        setSelection({ kind: "error-group", id: firstEntry.fingerprint });
        return;
      }

      setSelection({
        kind: "error-occurrence",
        id: firstEntry.id,
      });
    }
  }, [enabled, entries, groupedView, selection, setSelection]);
}
