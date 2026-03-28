import { useEffect, useState } from "react";

import type {
  StudioFilters,
  StudioGroupingMode,
  StudioLogEntry,
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
  const [draftProjectPath, setDraftProjectPath] = useState(initialProjectPath);

  useEffect(() => {
    setDraftProjectPath(initialProjectPath);
  }, [initialProjectPath]);

  return {
    filters,
    setFilters,
    selection,
    setSelection,
    offset,
    setOffset,
    grouping,
    setGrouping,
    draftProjectPath,
    setDraftProjectPath,
  };
}

export function useSyncSelectionFromEntries(
  entries: StudioLogEntry[],
  selection: StudioSelection,
  setSelection: (s: StudioSelection) => void,
) {
  useEffect(() => {
    if (selection?.kind === "delivery") {
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
  }, [entries, selection, setSelection]);
}
