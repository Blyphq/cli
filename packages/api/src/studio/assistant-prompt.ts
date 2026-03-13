import type {
  StudioAssistantHistoryItem,
  StudioAssistantReference,
  StudioNormalizedRecord,
  StudioStructuredGroupDetail,
} from "./types";

interface PromptEvidence {
  projectPath: string;
  selectedRecord: StudioNormalizedRecord | null;
  selectedGroup: StudioStructuredGroupDetail | null;
  records: StudioNormalizedRecord[];
  references: StudioAssistantReference[];
  userQuestion: string;
  history: StudioAssistantHistoryItem[];
  filtersSummary: string;
}

export function buildAssistantSystemPrompt(): string {
  return [
    "You are the Blyphq Studio assistant.",
    "Use only the provided log evidence.",
    "Separate direct observations from inferences.",
    "Do not invent fields, causes, or missing context.",
    "If you are uncertain, say what additional logs or fields would help.",
    "When patterns repeat, call out the repeated pattern and the related references.",
    "Keep answers concise but concrete.",
  ].join(" ");
}

export function buildAssistantReplyPrompt(input: PromptEvidence): string {
  return [
    `Project: ${input.projectPath}`,
    `Filters: ${input.filtersSummary}`,
    input.selectedGroup
      ? `Selected structured group: ${input.selectedGroup.group.title}`
      : input.selectedRecord
        ? `Selected record: ${input.selectedRecord.message}`
        : "Selected context: none",
    renderHistory(input.history),
    `User question: ${input.userQuestion}`,
    renderEvidence(input),
    "Respond with: observations, likely interpretation, related patterns, and next inspection steps.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildDescribeSelectionPrompt(input: PromptEvidence): string {
  return [
    `Project: ${input.projectPath}`,
    `Filters: ${input.filtersSummary}`,
    input.selectedGroup
      ? `Explain this structured group: ${input.selectedGroup.group.title}`
      : `Explain this log: ${input.selectedRecord?.message ?? "unknown record"}`,
    renderEvidence(input),
    "Explain what it means, what likely caused it, what nearby or related logs suggest, and what to inspect next.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderHistory(history: StudioAssistantHistoryItem[]): string {
  if (history.length === 0) {
    return "Recent chat history: none";
  }

  return `Recent chat history:\n${history
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join("\n")}`;
}

function renderEvidence(input: PromptEvidence): string {
  const selection = input.selectedGroup
    ? {
        group: {
          ...input.selectedGroup.group,
          records: input.selectedGroup.records.slice(0, 5).map(summarizeRecord),
        },
      }
    : input.selectedRecord
      ? { record: summarizeRecord(input.selectedRecord) }
      : null;

  return [
    "Evidence references:",
    JSON.stringify(input.references, null, 2),
    "Selected context:",
    JSON.stringify(selection, null, 2),
    "Evidence records:",
    JSON.stringify(input.records.map(summarizeRecord), null, 2),
  ].join("\n");
}

function summarizeRecord(record: StudioNormalizedRecord) {
  return {
    id: record.id,
    timestamp: record.timestamp,
    level: record.level,
    source: record.source,
    type: record.type,
    message: record.message,
    caller: record.caller,
    fileName: record.fileName,
    http: record.http
      ? {
          method: record.http.method,
          path: record.http.path,
          statusCode: record.http.statusCode,
          durationMs: record.http.durationMs,
        }
      : null,
    bindings: record.bindings,
    data: record.data,
  };
}
