export type StudioConfigFileType = "json" | "jiti";
export type StudioLogFileKind = "active" | "archive";
export type StudioLogStream = "combined" | "error" | "unknown";
export type StudioRecordSource = "server" | "client" | "structured" | "http" | "unknown";
export type StudioGroupingMode = "flat" | "grouped";
export type StudioErrorSort = "most-recent" | "most-frequent" | "first-seen";
export type StudioErrorViewMode = "grouped" | "raw";
export type StudioErrorStatus = "active" | "resolved" | "ignored";
export type StudioBuiltinSectionId =
  | "overview"
  | "errors"
  | "auth"
  | "payments"
  | "http"
  | "agents"
  | "background"
  | "database"
  | "all-logs";
export type StudioSectionId = StudioBuiltinSectionId | `custom:${string}`;
export type StudioGroupingReason =
  | "explicit-group-id"
  | "request-id"
  | "correlation-id"
  | "trace-id"
  | "heuristic";
export type StudioAssistantRole = "user" | "assistant";

export type StudioLogMode = "file" | "database";

export interface StudioDatabaseConfigSummary {
  enabled: boolean;
  ready: boolean;
  dialect: "postgres" | "mysql" | null;
  adapterKind: "prisma" | "drizzle" | null;
  model: string | null;
  label: string | null;
  status: "enabled" | "missing" | "invalid";
}

export interface StudioProjectResolution {
  requestedPath: string | null;
  resolvedFrom: "input" | "env" | "cwd";
  absolutePath: string;
  exists: boolean;
  isDirectory: boolean;
  valid: boolean;
  error: string | null;
}

export interface StudioConfigFileMatch {
  path: string;
  type: StudioConfigFileType;
}

export interface StudioLogRotationSummary {
  enabled: boolean;
  maxSizeBytes: number;
  maxArchives: number;
  compress: boolean;
}

export interface StudioLogFileSummary {
  enabled: boolean;
  dir: string;
  archiveDir: string;
  format: "ndjson";
  rotation: StudioLogRotationSummary;
}

export interface StudioClientLoggingSummary {
  enabled: boolean;
  path: string;
}

export interface StudioAiSummary {
  apiKeyConfigured: boolean;
  apiKeySource: "process-env" | "project-env" | "config" | "missing";
  model: string | null;
  modelSource: "config" | "project-env" | "process-env" | "missing";
  enabled: boolean;
}

export interface StudioResolvedPostHogErrorTrackingSummary {
  enabled: boolean;
  mode: string;
  enableExceptionAutocapture: boolean;
  ready: boolean;
  status: "enabled" | "missing";
}

export interface StudioResolvedPostHogConnectorSummary {
  enabled: boolean;
  mode: string;
  projectKey?: string;
  host: string;
  serviceName: string;
  errorTracking: StudioResolvedPostHogErrorTrackingSummary;
}

export interface StudioResolvedSentryConnectorSummary {
  enabled: boolean;
  mode: string;
  dsn?: string;
  environment?: string;
  release?: string;
  ready: boolean;
  status: "enabled" | "missing";
}

export interface StudioResolvedOtlpConnectorSummary {
  name: string;
  enabled: boolean;
  mode: string;
  endpoint?: string;
  headers: Record<string, string>;
  auth?: string;
  serviceName: string;
  ready: boolean;
  status: "enabled" | "missing";
}

export interface StudioResolvedConnectorsSummary {
  posthog: StudioResolvedPostHogConnectorSummary;
  sentry: StudioResolvedSentryConnectorSummary;
  otlp: StudioResolvedOtlpConnectorSummary[];
}

export interface StudioCustomSectionMatch {
  fields: string[];
  routes: string[];
  messages: string[];
}

export interface StudioCustomSectionDefinition {
  id: StudioSectionId;
  name: string;
  icon: string;
  match: StudioCustomSectionMatch;
}

export interface StudioResolvedConfigSummary {
  pretty: boolean;
  level: string;
  logDir: string;
  file: StudioLogFileSummary;
  clientLogging: StudioClientLoggingSummary;
  ai: StudioAiSummary;
  connectors: StudioResolvedConnectorsSummary;
  studio: {
    sections: StudioCustomSectionDefinition[];
  };
  destination: "file" | "database";
  database: StudioDatabaseConfigSummary;
}

export interface StudioConfigDiscovery {
  status: "found" | "not-found" | "error";
  winner: StudioConfigFileMatch | null;
  ignored: StudioConfigFileMatch[];
  rawContent: string | null;
  parsedConfig: unknown | null;
  loadError: string | null;
  resolved: StudioResolvedConfigSummary;
}

export interface StudioLogFile {
  id: string;
  absolutePath: string;
  relativePath: string;
  name: string;
  kind: StudioLogFileKind;
  stream: StudioLogStream;
  sizeBytes: number;
  modifiedAt: string;
}

export interface StudioLogDiscovery {
  logDir: string;
  archiveDir: string;
  logDirExists: boolean;
  archiveDirExists: boolean;
  files: StudioLogFile[];
  mode: StudioLogMode;
  database: StudioDatabaseConfigSummary | null;
}

export interface StudioDetectedSection {
  id: StudioSectionId;
  label: string;
  count: number;
  icon: string;
  kind: "builtin" | "custom";
  highlighted: boolean;
  unreadErrorCount: number;
  lastMatchedAt: string | null;
  lastErrorAt: string | null;
}

export interface StudioHttpDetails {
  kind: "framework-http" | "structured-http";
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  url: string | null;
  type: string | null;
  hostname: string | null;
  ip: string | null;
  userAgent: string | null;
  error: unknown;
}

export interface StudioResolvedSourceLocation {
  absolutePath: string;
  relativePath: string;
  line: number;
  column: number | null;
  origin: "stack" | "caller";
}

export type StudioSourceUnavailableReason =
  | "no_location"
  | "no_project_frame"
  | "outside_project"
  | "node_modules"
  | "unsupported_extension"
  | "file_missing"
  | "file_too_large"
  | "read_failed";

export interface StudioSourceContext {
  status: "resolved" | "unavailable";
  reason: StudioSourceUnavailableReason | null;
  location: StudioResolvedSourceLocation | null;
  startLine: number | null;
  endLine: number | null;
  focusLine: number | null;
  language: string | null;
  snippet: string | null;
}

export interface StudioNormalizedRecord {
  id: string;
  timestamp: string | null;
  level: string;
  message: string;
  source: StudioRecordSource;
  type: string | null;
  caller: string | null;
  bindings: Record<string, unknown> | null;
  data: unknown;
  fileId: string;
  fileName: string;
  filePath: string;
  lineNumber: number;
  malformed: boolean;
  http: StudioHttpDetails | null;
  error: unknown | null;
  stack: string | null;
  sourceLocation: StudioResolvedSourceLocation | null;
  raw: unknown;
}

export type StudioNormalizedRecordListItem = StudioNormalizedRecord & {
  kind: "record";
};

export interface StudioStructuredGroupSummary {
  kind: "structured-group";
  id: string;
  groupKey: string;
  groupingReason: StudioGroupingReason;
  title: string;
  type: string | null;
  source: "structured";
  recordCount: number;
  matchedRecordCount: number;
  timestampStart: string | null;
  timestampEnd: string | null;
  levelSummary: string[];
  fileIds: string[];
  fileNames: string[];
  representativeRecordId: string;
  nestedEventCount: number;
  previewMessages: string[];
}

export interface StudioStructuredGroupDetail {
  group: StudioStructuredGroupSummary;
  records: StudioNormalizedRecord[];
}

export type StudioLogListEntry = StudioNormalizedRecordListItem | StudioStructuredGroupSummary;

export interface StudioErrorFingerprintSource {
  key: string;
  kind: "source-location" | "stack-frame" | "caller" | "unknown";
  relativePath: string | null;
  line: number | null;
  column: number | null;
}

export interface StudioErrorStackFrame {
  raw: string;
  relativePath: string | null;
  absolutePath: string | null;
  line: number | null;
  column: number | null;
  inProject: boolean;
}

export interface StudioErrorOccurrence {
  kind: "occurrence";
  id: string;
  fingerprint: string;
  timestamp: string | null;
  level: string;
  type: string;
  message: string;
  messageFirstLine: string;
  fileId: string;
  fileName: string;
  filePath: string;
  lineNumber: number;
  caller: string | null;
  stack: string | null;
  stackFrames: StudioErrorStackFrame[];
  http: StudioHttpDetails | null;
  sourceLocation: StudioResolvedSourceLocation | null;
  fingerprintSource: StudioErrorFingerprintSource;
  sectionTags: string[];
  relatedTraceGroupId: string | null;
  structuredFields: Record<string, unknown>;
  raw: unknown;
}

export interface StudioErrorGroupSummary {
  kind: "error-group";
  fingerprint: string;
  errorType: string;
  message: string;
  messageFirstLine: string;
  occurrenceCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceLocation: StudioResolvedSourceLocation | null;
  fingerprintSource: StudioErrorFingerprintSource;
  http: Pick<StudioHttpDetails, "method" | "path" | "statusCode" | "url"> | null;
  sectionTags: string[];
  sparklineBuckets: number[];
  representativeOccurrenceId: string;
  relatedTraceGroupId: string | null;
}

export interface StudioErrorGroupDetail {
  group: StudioErrorGroupSummary;
  occurrences: StudioErrorOccurrence[];
}

export interface StudioErrorStats {
  uniqueErrorTypes: number;
  totalOccurrences: number;
  mostFrequentError:
    | {
        fingerprint: string;
        type: string;
        messageFirstLine: string;
        count: number;
      }
    | null;
  newErrorsComparedToPreviousSessions: {
    available: boolean;
    count: number | null;
  };
}

export interface StudioLogsQueryInput {
  projectPath?: string;
  limit?: number;
  offset?: number;
  level?: string;
  type?: string;
  search?: string;
  fileId?: string;
  from?: string;
  to?: string;
  grouping?: StudioGroupingMode;
  sectionId?: string;
}

export interface StudioErrorsQueryInput {
  projectPath?: string;
  limit?: number;
  offset?: number;
  view?: StudioErrorViewMode;
  sort?: StudioErrorSort;
  type?: string;
  sourceFile?: string;
  search?: string;
  fileId?: string;
  from?: string;
  to?: string;
  sectionId?: string;
}

export interface StudioLogsPage {
  records: StudioNormalizedRecord[];
  entries: StudioLogListEntry[];
  totalMatched: number;
  totalEntries: number;
  scannedRecords: number;
  returnedCount: number;
  offset: number;
  limit: number;
  truncated: boolean;
}

export interface StudioErrorsPage {
  entries: Array<StudioErrorGroupSummary | StudioErrorOccurrence>;
  groups: StudioErrorGroupSummary[];
  occurrences: StudioErrorOccurrence[];
  stats: StudioErrorStats;
  totalMatched: number;
  totalEntries: number;
  scannedRecords: number;
  returnedCount: number;
  offset: number;
  limit: number;
  truncated: boolean;
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  availableTypes: string[];
  availableSourceFiles: string[];
  availableSectionTags: string[];
}

export interface StudioAuthQueryInput {
  projectPath?: string;
  fileId?: string;
  from?: string;
  to?: string;
  search?: string;
  offset?: number;
  limit?: number;
  userId?: string;
  sectionId?: string;
}

export type StudioAuthEventKind =
  | "login"
  | "session"
  | "token"
  | "permission"
  | "oauth"
  | "other";

export type StudioAuthOutcome = "success" | "failure" | "unknown";

export interface StudioAuthEvent {
  id: string;
  recordId: string;
  timestamp: string | null;
  kind: StudioAuthEventKind;
  action: string;
  outcome: StudioAuthOutcome;
  userId: string | null;
  userEmail: string | null;
  ip: string | null;
  route: string | null;
  method: string | null;
  provider: string | null;
  scope: string | null;
  requiredPermission: string | null;
  statusCode: number | null;
  durationMs: number | null;
  sessionId: string | null;
  summary: string;
}

export interface StudioAuthStats {
  loginAttemptsTotal: number;
  loginSuccessCount: number;
  loginFailureCount: number;
  activeSessionCount: number;
  authErrorCount: number;
  suspiciousActivityCount: number;
}

export interface StudioAuthSuspiciousPattern {
  id: string;
  kind: "brute-force" | "invalid-token-spike" | "concurrent-sessions";
  title: string;
  description: string;
  affectedUserId: string | null;
  affectedIp: string | null;
  eventCount: number;
  timestampStart: string | null;
  timestampEnd: string | null;
  recordIds: string[];
}

export interface StudioAuthUserSummary {
  userId: string;
  loginCount: number;
  lastSeen: string | null;
  errorCount: number;
}

export interface StudioAuthOverview {
  stats: StudioAuthStats;
  timeline: StudioAuthEvent[];
  totalTimelineEvents: number;
  suspiciousPatterns: StudioAuthSuspiciousPattern[];
  users: StudioAuthUserSummary[];
}

export interface StudioLogFacets {
  types: string[];
  sources: StudioRecordSource[];
  levels: string[];
}

export interface StudioAssistantHistoryItem {
  role: StudioAssistantRole;
  content: string;
}

export interface StudioAssistantReference {
  kind: "record" | "group";
  id: string;
  label: string;
  fileName: string | null;
  timestamp: string | null;
  reason: string;
}

export interface StudioAssistantStatus {
  enabled: boolean;
  provider: "openrouter";
  model: string | null;
  availableModels: string[];
  apiKeySource: StudioAiSummary["apiKeySource"];
  modelSource: StudioAiSummary["modelSource"];
  reason: "missing_api_key" | "missing_model" | null;
  projectContext: {
    claudeMdPresent: boolean;
    claudeMdPath: string | null;
  };
}

export interface StudioAssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  references: StudioAssistantReference[];
}

export interface StudioAssistantReplyInput {
  projectPath?: string;
  history: StudioAssistantHistoryItem[];
  filters: Pick<
    StudioLogsQueryInput,
    "level" | "search" | "fileId" | "from" | "to" | "type"
  >;
  selectedRecordId?: string;
  selectedGroupId?: string;
}

export interface StudioMeta {
  project: StudioProjectResolution;
  config: StudioConfigDiscovery;
  sections: StudioDetectedSection[];
  logs: {
    mode: StudioLogMode;
    database: StudioDatabaseConfigSummary | null;
    logDir: string;
    archiveDir: string;
    logDirExists: boolean;
    archiveDirExists: boolean;
    fileCount: number;
    activeFileCount: number;
    archiveFileCount: number;
  };
}
