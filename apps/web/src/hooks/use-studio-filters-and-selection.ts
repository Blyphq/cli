import { useEffect, useState } from "react";

import type {
  StudioAuthUiState,
  StudioFilters,
  StudioGroupingMode,
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
  const [draftProjectPath, setDraftProjectPath] = useState(initialProjectPath);

  useEffect(() => {
    setDraftProjectPath(initialProjectPath);
    const persisted = readSidebarState(initialProjectPath);
    setSectionState(persisted.selectedSection);
    setVisitedAtBySection(persisted.visitedAtBySection);
    setAuthUi({ selectedUserId: null, selectedPatternId: null });
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
    return JSON.parse(raw) as StudioSidebarState;
  } catch {
    return { selectedSection: "overview", visitedAtBySection: {} };
  }
}

function writeSidebarState(projectPath: string, value: StudioSidebarState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getSidebarStorageKey(projectPath), JSON.stringify(value));
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
