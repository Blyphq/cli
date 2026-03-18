import { buildLogEntries } from "./grouping";
import { normalizeRecord, serializeForSearch } from "./normalize";
import { readLogFileText } from "./logs";

import type {
  StudioLogDiscovery,
  StudioLogsPage,
  StudioLogsQueryInput,
  StudioNormalizedRecord,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_SCANNED_RECORDS = 20_000;
const MAX_DECOMPRESSED_BYTES = 25 * 1024 * 1024;

export const MAX_DB_SCANNED_RECORDS = 5_000;

interface QueryLogsOptions {
  files: StudioLogDiscovery["files"];
  input: StudioLogsQueryInput;
  projectPath?: string;
  preloaded?: {
    records: StudioNormalizedRecord[];
    scannedRecords: number;
    truncated: boolean;
  };
}

export async function queryLogs({
  files,
  input,
  projectPath,
  preloaded,
}: QueryLogsOptions): Promise<StudioLogsPage> {
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);
  const candidateFiles = input.fileId
    ? files.filter((file) => file.id === input.fileId)
    : files;
  const loaded =
    preloaded ?? (await loadNormalizedRecords(candidateFiles, projectPath));
  const allRecords = loaded.records.slice().sort(compareRecordsDescending);
  const matchedRecords = filterRecords(allRecords, input).sort(compareRecordsDescending);
  const grouping = input.grouping ?? "grouped";
  const { entries } = buildLogEntries(matchedRecords, allRecords, grouping);
  const pagedEntries = entries.slice(offset, offset + limit);
  const pagedRecordIds = new Set(
    pagedEntries.flatMap((entry) =>
      entry.kind === "record" ? [entry.id] : [entry.representativeRecordId],
    ),
  );
  const pagedRecords = matchedRecords.filter((record) => pagedRecordIds.has(record.id));

  return {
    records: pagedRecords,
    entries: pagedEntries,
    totalMatched: matchedRecords.length,
    totalEntries: entries.length,
    scannedRecords: loaded.scannedRecords,
    returnedCount: pagedEntries.length,
    offset,
    limit,
    truncated: loaded.truncated,
  };
}

export async function loadNormalizedRecords(
  files: StudioLogDiscovery["files"],
  projectPath?: string,
): Promise<{
  records: StudioNormalizedRecord[];
  scannedRecords: number;
  truncated: boolean;
}> {
  let scannedRecords = 0;
  let consumedBytes = 0;
  let truncated = false;
  const normalized: StudioNormalizedRecord[] = [];

  for (const file of files) {
    if (scannedRecords >= MAX_SCANNED_RECORDS || consumedBytes >= MAX_DECOMPRESSED_BYTES) {
      truncated = true;
      break;
    }

    const { text, bytes } = await readLogFileText(file.absolutePath);
    let fileText = text;

    if (consumedBytes + bytes > MAX_DECOMPRESSED_BYTES) {
      fileText = takeTailWithinBudget(fileText, MAX_DECOMPRESSED_BYTES - consumedBytes);
      truncated = true;
    }

    consumedBytes += Buffer.byteLength(fileText, "utf8");

    const lines = fileText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (let index = 0; index < lines.length; index += 1) {
      if (scannedRecords >= MAX_SCANNED_RECORDS) {
        truncated = true;
        break;
      }

      const rawLine = lines[index]!;
      const parsed = parseJsonLine(rawLine);
      normalized.push(
        await normalizeRecord({
          file,
          lineNumber: index + 1,
          rawLine,
          parsed,
          projectPath,
        }),
      );
      scannedRecords += 1;
    }
  }

  return {
    records: normalized,
    scannedRecords,
    truncated,
  };
}

export function filterRecords(
  records: StudioNormalizedRecord[],
  input: Pick<
    StudioLogsQueryInput,
    "level" | "type" | "search" | "fileId" | "from" | "to"
  >,
): StudioNormalizedRecord[] {
  return records.filter((record) => matchesFilters(record, input));
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}

function matchesFilters(
  record: StudioNormalizedRecord,
  input: Pick<
    StudioLogsQueryInput,
    "level" | "type" | "search" | "fileId" | "from" | "to"
  >,
): boolean {
  if (input.fileId && record.fileId !== input.fileId) {
    return false;
  }

  if (input.level && record.level.toLowerCase() !== input.level.toLowerCase()) {
    return false;
  }

  if (
    input.type &&
    (!record.type || record.type.toLowerCase() !== input.type.toLowerCase())
  ) {
    return false;
  }

  if (input.from) {
    const fromTimestamp = Date.parse(input.from);
    const recordTimestamp = record.timestamp ? Date.parse(record.timestamp) : Number.NaN;

    if (
      !Number.isNaN(fromTimestamp) &&
      !Number.isNaN(recordTimestamp) &&
      recordTimestamp < fromTimestamp
    ) {
      return false;
    }
  }

  if (input.to) {
    const toTimestamp = Date.parse(input.to);
    const recordTimestamp = record.timestamp ? Date.parse(record.timestamp) : Number.NaN;

    if (
      !Number.isNaN(toTimestamp) &&
      !Number.isNaN(recordTimestamp) &&
      recordTimestamp > toTimestamp
    ) {
      return false;
    }
  }

  if (input.search) {
    const haystack = [
      record.message,
      record.caller ?? "",
      serializeForSearch(record.bindings),
      serializeForSearch(record.data),
      serializeForSearch(record.raw),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(input.search.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function compareRecordsDescending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  const leftTime = left.timestamp ? Date.parse(left.timestamp) : Number.NaN;
  const rightTime = right.timestamp ? Date.parse(right.timestamp) : Number.NaN;

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  if (left.filePath !== right.filePath) {
    return right.filePath.localeCompare(left.filePath);
  }

  return right.lineNumber - left.lineNumber;
}

function takeTailWithinBudget(text: string, remainingBytes: number): string {
  if (remainingBytes <= 0) {
    return "";
  }

  const buffer = Buffer.from(text, "utf8");

  if (buffer.byteLength <= remainingBytes) {
    return text;
  }

  const sliced = buffer.subarray(buffer.byteLength - remainingBytes).toString("utf8");
  const firstNewline = sliced.indexOf("\n");

  return firstNewline >= 0 ? sliced.slice(firstNewline + 1) : sliced;
}
