import { buildBackgroundJobRunDetail } from "./background-jobs";
import { buildGroupDetails } from "./grouping";
import { filterRecords } from "./query";
import { resolveRecordSourceContext } from "./source";

import type {
  StudioBackgroundJobRunDetail,
  StudioAssistantReference,
  StudioLogsQueryInput,
  StudioNormalizedRecord,
  StudioSourceContext,
  StudioStructuredGroupDetail,
} from "./types";

const MAX_CONTEXT_RECORDS = 30;
const MAX_SERIALIZED_BYTES = 40 * 1024;

interface BuildAssistantContextInput {
  allRecords: StudioNormalizedRecord[];
  filters: Pick<
    StudioLogsQueryInput,
    "level" | "search" | "fileId" | "from" | "to" | "type"
  >;
  selectedRecordId?: string;
  selectedGroupId?: string;
  selectedBackgroundRunId?: string;
  projectPath: string;
  userQuestion: string;
}

export interface StudioAssistantContext {
  selectedRecord: StudioNormalizedRecord | null;
  selectedRecordSource: StudioSourceContext | null;
  selectedGroup: StudioStructuredGroupDetail | null;
  selectedBackgroundRun: StudioBackgroundJobRunDetail | null;
  evidenceRecords: StudioNormalizedRecord[];
  references: StudioAssistantReference[];
}

export async function buildAssistantContext(
  input: BuildAssistantContextInput,
): Promise<StudioAssistantContext> {
  const groups = buildGroupDetails(input.allRecords);
  const selectedRecord =
    input.selectedRecordId
      ? input.allRecords.find((record) => record.id === input.selectedRecordId) ?? null
      : null;
  const selectedGroup =
    input.selectedGroupId ? groups.get(input.selectedGroupId) ?? null : null;
  const selectedBackgroundRun =
    input.selectedBackgroundRunId
      ? buildBackgroundJobRunDetail({
          runId: input.selectedBackgroundRunId,
          records: input.allRecords,
        })
      : null;
  const filteredRecords = filterRecords(input.allRecords, input.filters);
  const scored = new Map<string, { record: StudioNormalizedRecord; score: number }>();

  const addRecord = (record: StudioNormalizedRecord, score: number) => {
    const existing = scored.get(record.id);
    if (!existing || score > existing.score) {
      scored.set(record.id, { record, score });
    }
  };

  if (selectedGroup) {
    for (const record of selectedGroup.records) {
      addRecord(record, 1_000);
    }
  }

  if (selectedBackgroundRun) {
    for (const event of selectedBackgroundRun.timeline) {
      const matched = input.allRecords.find((record) => record.id === event.recordId);
      if (matched) {
        addRecord(matched, 1_050);
      }
    }
  }

  if (selectedRecord) {
    addRecord(selectedRecord, 1_100);
  }

  for (const record of filteredRecords) {
    addRecord(record, 800);
  }

  const selectedKey = getRecordCorrelationKey(selectedRecord);
  const searchTerms = extractSearchTerms([
    input.userQuestion,
    selectedRecord?.message ?? "",
    selectedRecord?.type ?? "",
    selectedRecord?.caller ?? "",
    selectedRecord?.http?.path ?? "",
  ]);

  for (const record of input.allRecords) {
    let score = 0;

    if (selectedKey && getRecordCorrelationKey(record) === selectedKey) {
      score += 700;
    }

    if (selectedRecord?.type && record.type === selectedRecord.type) {
      score += 150;
    }

    if (selectedRecord?.caller && record.caller === selectedRecord.caller) {
      score += 120;
    }

    if (selectedRecord?.source && record.source === selectedRecord.source) {
      score += 60;
    }

    if (
      selectedRecord?.http?.method &&
      selectedRecord.http.method === record.http?.method &&
      selectedRecord.http.path === record.http?.path
    ) {
      score += 200;
    }

    if (searchTerms.length > 0) {
      const haystack = [
        record.message,
        record.type ?? "",
        record.caller ?? "",
        record.http?.path ?? "",
        JSON.stringify(record.data ?? null),
      ]
        .join(" ")
        .toLowerCase();

      for (const term of searchTerms) {
        if (haystack.includes(term)) {
          score += 20;
        }
      }
    }

    if (score > 0) {
      addRecord(record, score);
    }
  }

  const sortedEvidence = Array.from(scored.values())
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftTime = left.record.timestamp ? Date.parse(left.record.timestamp) : Number.NaN;
      const rightTime = right.record.timestamp ? Date.parse(right.record.timestamp) : Number.NaN;

      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return right.record.id.localeCompare(left.record.id);
    })
    .map((entry) => entry.record);

  const evidenceRecords = takeWithinBudget(sortedEvidence);
  const references = buildReferences({
    evidenceRecords,
    selectedGroup,
    selectedRecord,
    selectedBackgroundRun,
    allGroups: groups,
  });
  const selectedRecordSource = selectedRecord
    ? await resolveRecordSourceContext(input.projectPath, selectedRecord)
    : null;

  return {
    selectedRecord,
    selectedRecordSource,
    selectedGroup,
    selectedBackgroundRun,
    evidenceRecords,
    references,
  };
}

function buildReferences(input: {
  evidenceRecords: StudioNormalizedRecord[];
  selectedGroup: StudioStructuredGroupDetail | null;
  selectedRecord: StudioNormalizedRecord | null;
  selectedBackgroundRun: StudioBackgroundJobRunDetail | null;
  allGroups: Map<string, StudioStructuredGroupDetail>;
}): StudioAssistantReference[] {
  const references: StudioAssistantReference[] = [];

  if (input.selectedBackgroundRun) {
    references.push({
      kind: "background-run",
      id: input.selectedBackgroundRun.run.id,
      label: input.selectedBackgroundRun.run.jobName,
      fileName: null,
      timestamp: input.selectedBackgroundRun.run.finishedAt ?? input.selectedBackgroundRun.run.startedAt,
      reason: "selected background run",
    });
  }

  if (input.selectedGroup) {
    references.push({
      kind: "group",
      id: input.selectedGroup.group.id,
      label: input.selectedGroup.group.title,
      fileName: input.selectedGroup.group.fileNames[0] ?? null,
      timestamp: input.selectedGroup.group.timestampEnd,
      reason: "selected group",
    });
  }

  if (input.selectedRecord) {
    references.push({
      kind: "record",
      id: input.selectedRecord.id,
      label: input.selectedRecord.message,
      fileName: input.selectedRecord.fileName,
      timestamp: input.selectedRecord.timestamp,
      reason: "selected record",
    });
  }

  for (const record of input.evidenceRecords.slice(0, 8)) {
    const grouped = Array.from(input.allGroups.values()).find((group) =>
      group.records.some((candidate) => candidate.id === record.id),
    );

    references.push({
      kind: grouped ? "group" : "record",
      id: grouped ? grouped.group.id : record.id,
      label: grouped ? grouped.group.title : record.message,
      fileName: grouped ? grouped.group.fileNames[0] ?? null : record.fileName,
      timestamp: grouped ? grouped.group.timestampEnd : record.timestamp,
      reason:
        grouped && record.id !== grouped.group.representativeRecordId
          ? "related grouped pattern"
          : "evidence log",
    });
  }

  return dedupeReferences(references).slice(0, 10);
}

function takeWithinBudget(records: StudioNormalizedRecord[]): StudioNormalizedRecord[] {
  const selected: StudioNormalizedRecord[] = [];
  let consumedBytes = 0;

  for (const record of records) {
    if (selected.length >= MAX_CONTEXT_RECORDS) {
      break;
    }

    const serialized = JSON.stringify(record);
    const bytes = Buffer.byteLength(serialized, "utf8");

    if (consumedBytes + bytes > MAX_SERIALIZED_BYTES) {
      break;
    }

    consumedBytes += bytes;
    selected.push(record);
  }

  return selected;
}

function dedupeReferences(references: StudioAssistantReference[]): StudioAssistantReference[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getRecordCorrelationKey(record: StudioNormalizedRecord | null): string | null {
  if (!record) {
    return null;
  }

  for (const candidate of [record.raw, record.bindings, record.data]) {
    if (!isPlainObject(candidate)) {
      continue;
    }

    for (const key of ["groupId", "requestId", "correlationId", "traceId", "sessionId"]) {
      const value = candidate[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
}

function extractSearchTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.toLowerCase().split(/[^a-z0-9/_-]+/))
        .filter((part) => part.length >= 3),
    ),
  ).slice(0, 12);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
