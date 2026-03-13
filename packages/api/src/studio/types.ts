export type StudioConfigFileType = "json" | "jiti";
export type StudioLogFileKind = "active" | "archive";
export type StudioLogStream = "combined" | "error" | "unknown";
export type StudioRecordSource = "server" | "client" | "structured" | "http" | "unknown";

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

export interface StudioResolvedConfigSummary {
  pretty: boolean;
  level: string;
  logDir: string;
  file: StudioLogFileSummary;
  clientLogging: StudioClientLoggingSummary;
  connectors: StudioResolvedConnectorsSummary;
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
  raw: unknown;
}

export interface StudioLogsQueryInput {
  projectPath?: string;
  limit?: number;
  offset?: number;
  level?: string;
  search?: string;
  fileId?: string;
  from?: string;
  to?: string;
}

export interface StudioLogsPage {
  records: StudioNormalizedRecord[];
  totalMatched: number;
  scannedRecords: number;
  returnedCount: number;
  offset: number;
  limit: number;
  truncated: boolean;
}

export interface StudioMeta {
  project: StudioProjectResolution;
  config: StudioConfigDiscovery;
  logs: {
    logDir: string;
    archiveDir: string;
    logDirExists: boolean;
    archiveDirExists: boolean;
    fileCount: number;
    activeFileCount: number;
    archiveFileCount: number;
  };
}
