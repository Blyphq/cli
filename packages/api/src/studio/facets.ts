import type { StudioLogFacets, StudioLogsQueryInput, StudioNormalizedRecord } from "./types";

import { filterRecords } from "./query";

export function getLogFacets(
  records: StudioNormalizedRecord[],
  input: Pick<StudioLogsQueryInput, "fileId" | "from" | "to" | "level" | "search">,
): StudioLogFacets {
  const filtered = filterRecords(records, input);
  const types = Array.from(
    new Set(
      filtered
        .map((record) => record.type)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const levels = Array.from(new Set(filtered.map((record) => record.level)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const sources = Array.from(new Set(filtered.map((record) => record.source))).sort(
    (left, right) => left.localeCompare(right),
  ) as StudioLogFacets["sources"];

  return {
    types,
    levels,
    sources,
  };
}
