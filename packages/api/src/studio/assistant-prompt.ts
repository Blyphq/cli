import type {
  StudioAssistantHistoryItem,
  StudioAssistantReference,
  StudioNormalizedRecord,
  StudioSourceContext,
  StudioStructuredGroupDetail,
} from "./types";

interface PromptEvidence {
  projectPath: string;
  selectedRecord: StudioNormalizedRecord | null;
  selectedRecordSource: StudioSourceContext | null;
  selectedGroup: StudioStructuredGroupDetail | null;
  records: StudioNormalizedRecord[];
  references: StudioAssistantReference[];
  userQuestion: string;
  history: StudioAssistantHistoryItem[];
  filtersSummary: string;
}

export function buildAssistantSystemPrompt(): string {
  return [
    "You are Blyp Studio, an observability copilot for local Blyp logs.",
    "Behave like a hands-on debugging partner who has spent time in logs, traces, and incidents, not like a generic chatbot.",
    "Use only the provided log evidence and explicitly distinguish observation from inference.",
    "Start with the most useful takeaway first, then explain why you believe it.",
    "Prioritize: what happened, why it likely happened, blast radius or impact, repeated patterns, and what to inspect next.",
    "When the logs suggest a causal chain, walk through that chain clearly and point to the corroborating signals.",
    "When there are multiple plausible explanations, rank them and say what evidence is missing to disambiguate them.",
    "Call out matching or related logs when they strengthen the conclusion, especially repeated errors, correlated requests, or the same caller/type/path.",
    "When selected source context is provided, use it as code evidence and explain how it relates to the log.",
    "Do not confuse the throw site with the full root cause; if the snippet is insufficient, say what additional code would be needed.",
    "Prefer concrete language like 'I traced', 'I correlated', or 'I suspect' when it matches the certainty level.",
    "Do not invent fields, causes, or missing context.",
    "Write in compact markdown with short sections and bullets when useful, but keep the tone helpful and operational.",
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
    "Respond in markdown with sections titled: Takeaway, Evidence, Likely explanation, Related signals, and Next steps.",
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
    "Explain it in markdown with sections titled: Takeaway, What this means, What likely caused it, Related signals, and What to inspect next.",
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
    "Selected source context:",
    JSON.stringify(summarizeSourceContext(input.selectedRecordSource), null, 2),
    "Selected context:",
    JSON.stringify(selection, null, 2),
    "Evidence records:",
    JSON.stringify(input.records.map(summarizeRecord), null, 2),
  ].join("\n");
}

function summarizeSourceContext(source: StudioSourceContext | null) {
  if (!source || source.status !== "resolved" || !source.location) {
    return null;
  }

  return {
    path: source.location.relativePath,
    line: source.location.line,
    column: source.location.column,
    origin: source.location.origin,
    startLine: source.startLine,
    endLine: source.endLine,
    language: source.language,
    snippet: source.snippet,
  };
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
    stack: record.stack,
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
