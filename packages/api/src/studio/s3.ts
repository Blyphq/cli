import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { StudioLogFile, StudioNormalizedRecord } from "./types";
import { normalizeRecord } from "./normalize";
import {
  parseS3Uri,
  parseS3ObjectKey,
  s3HourPrefix,
  normalizeS3Prefix,
  type S3Connection,
  type S3ReadSettings,
} from "./s3-format";
import { S3ObjectCache } from "./s3-cache";

export type { S3Connection, S3ReadSettings } from "./s3-format";
export { parseS3Uri } from "./s3-format";
export interface S3SourceSummary {
  id: string;
  uri: string;
  region: string | null;
  endpoint: string | null;
  hasProject: boolean;
  refreshIntervalMs: number;
  historicalRefreshIntervalMs: number;
}
export interface S3Object {
  key: string;
  size: number;
  etag: string;
}
export interface S3ReadTransport {
  list(
    prefix: string,
    token: string | undefined,
    signal: AbortSignal,
  ): Promise<{ objects: S3Object[]; next?: string }>;
  get(
    object: S3Object,
    signal: AbortSignal,
  ): Promise<AsyncIterable<Uint8Array>>;
}
export interface S3DatasetStatus {
  id: string;
  sourceId: string;
  from: string;
  to: string;
  follow: boolean;
  version: number;
  state: "loading" | "ready" | "partial" | "error" | "cancelled";
  complete: boolean;
  stale: boolean;
  lastSyncedAt: string | null;
  downloadedBytes: number;
  reservedDownloadBytes: number;
  cacheHits: number;
  listAttempts: number;
  getAttempts: number;
  loadedRecords: number;
  decodedBytes: number;
  scannedRecords: number;
  discoveredObjects: number;
  loadedObjects: number;
  scannedHours: number;
  totalHours: number;
  grants: number;
  canLoadMore: boolean;
  reason: string | null;
}
const MB = 1_048_576,
  HOUR = 3_600_000;
const DEFAULTS = {
  downloadBytes: 16 * MB,
  listAttempts: 20,
  getAttempts: 64,
  records: 20_000,
  decodedBytes: 25 * MB,
  maxGrants: 5,
  refreshIntervalMs: 30_000,
  historicalRefreshIntervalMs: 300_000,
};
type Settings = typeof DEFAULTS;
type ListPage = { objects: S3Object[]; next?: string };
interface Source {
  identity: string;
  summary: S3SourceSummary;
  connection: S3Connection;
  projectPath?: string;
  settings: Settings;
  cache: S3ObjectCache;
  transport?: S3ReadTransport;
  listings: Map<string, { at: number; page: ListPage }>;
  flights: Map<string, Promise<unknown>>;
}
interface HourScan {
  hour: number;
  token?: string;
  done: boolean;
  at: number;
  started: boolean;
}
interface Dataset {
  source: Source;
  status: S3DatasetStatus;
  scans: HourScan[];
  objects: S3Object[];
  seen: Map<string, string>;
  loaded: Set<string>;
  records: StudioNormalizedRecord[];
  files: StudioLogFile[];
  snapshots: Map<
    number,
    {
      records: StudioNormalizedRecord[];
      files: StudioLogFile[];
      status: S3DatasetStatus;
    }
  >;
  partialObject?: { object: S3Object; lines: string[]; index: number };
  work?: Promise<void>;
  controller: AbortController;
  touchedAt: number;
}
const sources = new Map<string, Source>();
const identities = new Map<string, string>();
const credentialProviders = new WeakMap<object, string>();
const datasets = new Map<string, Dataset>();

function resolvedSettings(input: S3ReadSettings = {}): Settings {
  const result = { ...DEFAULTS };
  for (const name of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = input[name];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`studio.s3.${name} must be a positive safe integer.`);
      result[name] = value;
    }
  }
  if (input.cache?.mode && !["disk", "memory"].includes(input.cache.mode))
    throw new Error("Invalid S3 cache mode.");
  for (const value of [input.cache?.maxBytes, input.cache?.ttlMs])
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
      throw new Error("S3 cache limits must be positive safe integers.");
  return result;
}

export function registerS3Source(
  connection: S3Connection,
  options: {
    projectPath?: string;
    settings?: S3ReadSettings;
    identity?: string;
    transport?: S3ReadTransport;
  } = {},
): S3SourceSummary {
  if (
    !connection ||
    typeof connection.bucket !== "string" ||
    !connection.bucket
  )
    throw new Error("S3 source requires s3.bucket.");
  if (
    connection.region !== undefined &&
    (typeof connection.region !== "string" || !connection.region.trim())
  )
    throw new Error("S3 region must be a nonempty string.");
  if (
    connection.forcePathStyle !== undefined &&
    typeof connection.forcePathStyle !== "boolean"
  )
    throw new Error("S3 forcePathStyle must be boolean.");
  if (
    connection.credentials &&
    typeof connection.credentials !== "function" &&
    (typeof connection.credentials.accessKeyId !== "string" ||
      !connection.credentials.accessKeyId ||
      typeof connection.credentials.secretAccessKey !== "string" ||
      !connection.credentials.secretAccessKey)
  )
    throw new Error("S3 credentials require accessKeyId and secretAccessKey.");
  const parsed = {
    ...parseS3Uri(`s3://${connection.bucket}`),
    prefix: normalizeS3Prefix(connection.prefix),
  };
  if (connection.endpoint) {
    const url = new URL(connection.endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid S3 API endpoint.");
  }
  const settings = resolvedSettings(options.settings);
  // The digest never leaves this process. Credential material is neither a URI nor a cache filename.
  let providerId: string | undefined;
  if (typeof connection.credentials === "function") {
    providerId =
      credentialProviders.get(connection.credentials) ?? randomUUID();
    credentialProviders.set(connection.credentials, providerId);
  }
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        connection,
        options.projectPath,
        options.identity,
        options.settings,
        providerId,
        process.env.AWS_PROFILE,
        process.env.AWS_ACCESS_KEY_ID,
      ]),
    )
    .digest("hex");
  const existing = identities.get(identity);
  if (existing) return sources.get(existing)!.summary;
  const id = randomUUID();
  const summary: S3SourceSummary = {
    id,
    uri: `s3://${parsed.bucket}${parsed.prefix ? "/" + parsed.prefix.split("/").map(encodeURIComponent).join("/") : ""}`,
    region: connection.region ?? null,
    endpoint: connection.endpoint ?? null,
    hasProject: !!options.projectPath,
    refreshIntervalMs: settings.refreshIntervalMs,
    historicalRefreshIntervalMs: settings.historicalRefreshIntervalMs,
  };
  sources.set(id, {
    identity,
    summary,
    connection: { ...connection, ...parsed },
    projectPath: options.projectPath,
    settings,
    cache: new S3ObjectCache(options.settings?.cache),
    transport: options.transport,
    listings: new Map(),
    flights: new Map(),
  });
  identities.set(identity, id);
  return summary;
}

export function getS3Source(id: string): S3SourceSummary {
  const source = sources.get(id);
  if (!source)
    throw new Error("Unknown S3 source. Reload Studio to reconnect.");
  return source.summary;
}
export function getDirectS3Source(
  projectPath?: string,
  fallback?: S3Connection,
  settings?: S3ReadSettings,
): S3SourceSummary | null {
  const uri = process.env.BLYPQ_STUDIO_S3_SOURCE;
  if (!uri) return null;
  const parsed = parseS3Uri(uri);
  return registerS3Source(
    {
      ...fallback,
      ...parsed,
      region: process.env.BLYPQ_STUDIO_S3_REGION || fallback?.region,
      endpoint: process.env.BLYPQ_STUDIO_S3_ENDPOINT || fallback?.endpoint,
      forcePathStyle:
        process.env.BLYPQ_STUDIO_S3_PATH_STYLE === "true" ||
        fallback?.forcePathStyle,
    },
    { projectPath, settings, identity: process.env.AWS_PROFILE ?? "default" },
  );
}
function sourceTransport(source: Source): S3ReadTransport {
  if (source.transport) return source.transport;
  const client = new S3Client({
    ...source.connection,
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  source.transport = {
    async list(prefix, token, signal) {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: source.connection.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
        { abortSignal: signal },
      );
      if (result.IsTruncated && !result.NextContinuationToken)
        throw new Error("Invalid S3 listing: missing continuation token.");
      return {
        objects: (result.Contents ?? [])
          .filter((o) => o.Key && o.ETag && Number.isSafeInteger(o.Size))
          .map((o) => ({ key: o.Key!, etag: o.ETag!, size: o.Size! })),
        next: result.IsTruncated ? result.NextContinuationToken : undefined,
      };
    },
    async get(object, signal) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: source.connection.bucket,
          Key: object.key,
          IfMatch: object.etag,
        }),
        { abortSignal: signal },
      );
      if (!result.Body) throw new Error("S3 object has no body.");
      return result.Body as AsyncIterable<Uint8Array>;
    },
  };
  return source.transport;
}
function dataset(id: string): Dataset {
  const value = datasets.get(id);
  if (!value)
    throw new Error("Unknown or expired S3 dataset. Select a range again.");
  value.touchedAt = Date.now();
  return value;
}
function scansFor(from: number, to: number): HourScan[] {
  const scans: HourScan[] = [];
  for (
    let hour = Math.floor(to / HOUR) * HOUR;
    hour >= Math.floor(from / HOUR) * HOUR;
    hour -= HOUR
  )
    scans.push({ hour, done: false, at: 0, started: false });
  return scans;
}
export function openS3Dataset(input: {
  sourceId: string;
  from: string;
  to: string;
  follow?: boolean;
}): S3DatasetStatus {
  const source = sources.get(input.sourceId);
  if (!source) throw new Error("Unknown S3 source.");
  const from = Date.parse(input.from),
    to = Date.parse(input.to);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    from > to ||
    to - from > 7 * 86_400_000 ||
    to > Date.now() + 300_000
  )
    throw new Error("Select a valid time range of at most seven days.");
  for (const [id, entry] of datasets)
    if (!entry.work && entry.touchedAt < Date.now() - 1_800_000) {
      entry.controller.abort();
      datasets.delete(id);
    }
  if (datasets.size >= 32)
    throw new Error("Close an existing S3 dataset before opening another.");
  const id = randomUUID(),
    scans = scansFor(from, to);
  const status: S3DatasetStatus = {
    id,
    sourceId: input.sourceId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    follow: input.follow ?? false,
    version: 0,
    state: "loading",
    complete: false,
    stale: false,
    lastSyncedAt: null,
    downloadedBytes: 0,
    reservedDownloadBytes: 0,
    cacheHits: 0,
    listAttempts: 0,
    getAttempts: 0,
    loadedRecords: 0,
    scannedRecords: 0,
    decodedBytes: 0,
    discoveredObjects: 0,
    loadedObjects: 0,
    scannedHours: 0,
    totalHours: scans.length,
    grants: 1,
    canLoadMore: true,
    reason: null,
  };
  const value: Dataset = {
    source,
    status,
    scans,
    objects: [],
    seen: new Map(),
    loaded: new Set(),
    records: [],
    files: [],
    snapshots: new Map([
      [0, { records: [], files: [], status: { ...status } }],
    ]),
    controller: new AbortController(),
    touchedAt: Date.now(),
  };
  datasets.set(id, value);
  start(value);
  return { ...status };
}
export function s3DatasetStatus(id: string): S3DatasetStatus {
  return { ...dataset(id).status };
}
export function getS3DatasetRecords(
  id: string,
  sourceId?: string,
  version?: number,
): {
  records: StudioNormalizedRecord[];
  files: StudioLogFile[];
  scannedRecords: number;
  truncated: boolean;
  status: S3DatasetStatus;
} {
  const d = dataset(id);
  if (sourceId && sourceId !== d.source.summary.id)
    throw new Error("S3 dataset does not belong to this source.");
  const snapshot = d.snapshots.get(version ?? d.status.version);
  if (!snapshot)
    throw new Error("S3 snapshot expired. Refresh the dataset status.");
  return {
    records: snapshot.records,
    files: snapshot.files,
    scannedRecords: snapshot.status.scannedRecords,
    truncated: !snapshot.status.complete,
    status: { ...snapshot.status },
  };
}
export function extendS3Dataset(id: string): S3DatasetStatus {
  const d = dataset(id);
  if (d.work) return { ...d.status };
  if (d.status.grants >= d.source.settings.maxGrants)
    throw new Error("Dataset limit reached. Narrow the time range.");
  d.status.grants++;
  d.controller = new AbortController();
  start(d);
  return { ...d.status };
}
export function closeS3Dataset(id: string): { closed: boolean } {
  const d = datasets.get(id);
  if (!d) return { closed: true };
  d.controller.abort();
  datasets.delete(id);
  return { closed: true };
}
export function cancelS3Dataset(id: string): S3DatasetStatus {
  const d = dataset(id);
  d.controller.abort();
  d.status.state = "cancelled";
  d.status.complete = false;
  d.status.reason = "Loading cancelled.";
  return { ...d.status };
}
export function refreshS3Dataset(id: string): S3DatasetStatus {
  const d = dataset(id);
  if (d.work || d.controller.signal.aborted) return { ...d.status };
  if (d.status.follow) {
    const duration = Date.parse(d.status.to) - Date.parse(d.status.from),
      now = Date.now();
    d.status.from = new Date(now - duration).toISOString();
    d.status.to = new Date(now).toISOString();
    const existing = new Map(d.scans.map((s) => [s.hour, s]));
    d.scans = scansFor(now - duration, now).map(
      (s) => existing.get(s.hour) ?? s,
    );
    // Eviction does not refund a grant: live polling cannot renew its own budget.
    d.records = d.records.filter(
      (r) => r.timestamp && Date.parse(r.timestamp) >= now - duration,
    );
  }
  for (const scan of d.scans) {
    const ttl =
      scan.hour >= Math.floor(Date.now() / HOUR) * HOUR - HOUR
        ? d.source.settings.refreshIntervalMs
        : d.source.settings.historicalRefreshIntervalMs;
    if (scan.done && scan.at + ttl <= Date.now()) {
      scan.done = false;
      scan.token = undefined;
      scan.started = false;
    }
  }
  d.status.totalHours = d.scans.length;
  if (d.scans.some((s) => !s.done) || d.objects.length || d.partialObject)
    start(d);
  return { ...d.status };
}
export async function waitForS3Dataset(id: string): Promise<S3DatasetStatus> {
  const d = dataset(id);
  await d.work;
  return { ...d.status };
}
class BudgetStop extends Error {}
function limit(d: Dataset, name: keyof Settings): number {
  return d.source.settings[name] * d.status.grants;
}
function start(d: Dataset): void {
  d.status.state = "loading";
  d.status.reason = null;
  d.status.complete = false;
  d.work = load(d)
    .then(() => {
      if (d.controller.signal.aborted) return;
      d.status.complete =
        !d.partialObject && !d.objects.length && d.scans.every((s) => s.done);
      d.status.state = d.status.complete ? "ready" : "partial";
      d.status.stale = false;
      d.status.lastSyncedAt = new Date().toISOString();
    })
    .catch((error) => {
      d.status.complete = false;
      d.status.state = d.controller.signal.aborted
        ? "cancelled"
        : error instanceof BudgetStop
          ? "partial"
          : "error";
      d.status.stale = d.status.state === "error";
      d.status.reason = d.controller.signal.aborted
        ? "Loading cancelled."
        : error instanceof BudgetStop
          ? error.message
          : describeError(error);
    })
    .finally(() => {
      d.status.loadedRecords = d.records.length;
      d.status.scannedHours = d.scans.filter((s) => s.done).length;
      d.status.canLoadMore =
        d.status.grants < d.source.settings.maxGrants && !d.status.complete;
      d.status.version++;
      d.snapshots.set(d.status.version, {
        records: d.records,
        files: d.files,
        status: { ...d.status },
      });
      while (d.snapshots.size > 5)
        d.snapshots.delete(d.snapshots.keys().next().value!);
      d.work = undefined;
    });
}
function describeError(error: unknown): string {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;
  const name = (error as Error)?.name;
  if (
    name === "CredentialsProviderError" ||
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch"
  )
    return "S3 credentials are missing, expired, or invalid. Update the Studio server credentials.";
  if (status === 403 || name === "AccessDenied")
    return "S3 permission denied. Studio needs ListBucket and GetObject access to this prefix.";
  if (status === 404)
    return "An S3 bucket or log object is unavailable. Cached results are preserved.";
  if (status === 412)
    return "An immutable log object changed. Refresh the source before loading it again.";
  if (status === 429 || status === 503)
    return "S3 is throttling requests. Cached results are preserved; retry later.";
  if (name === "AbortError" || name === "TimeoutError")
    return "S3 request timed out. Cached results are preserved.";
  // SDK messages can contain signed URLs. Never echo transport error text.
  return "S3 read failed or an object has invalid Blyp format. Cached results are preserved.";
}
async function attempt<T>(
  d: Dataset,
  kind: "list" | "get",
  size: number,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 3; i++) {
    d.controller.signal.throwIfAborted();
    const field = kind === "list" ? "listAttempts" : "getAttempts";
    if (d.status[field] >= limit(d, field))
      throw new BudgetStop(
        `${kind.toUpperCase()} request allowance reached. Load more to continue.`,
      );
    if (
      kind === "get" &&
      d.status.reservedDownloadBytes + size > limit(d, "downloadBytes")
    )
      throw new BudgetStop(
        "Download allowance reached. Load more to continue.",
      );
    d.status[field]++;
    if (kind === "get") d.status.reservedDownloadBytes += size;
    try {
      return await action(
        AbortSignal.any([d.controller.signal, AbortSignal.timeout(10_000)]),
      );
    } catch (error) {
      const code = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (
        i === 2 ||
        d.controller.signal.aborted ||
        (code && code !== 408 && code !== 429 && code < 500) ||
        [
          "CredentialsProviderError",
          "InvalidAccessKeyId",
          "SignatureDoesNotMatch",
          "AccessDenied",
        ].includes((error as Error)?.name)
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * Math.min(2000, 250 * 2 ** i)),
      );
    }
  }
  throw new Error("Unreachable retry state");
}
async function listing(d: Dataset, scan: HourScan): Promise<ListPage> {
  const prefix = s3HourPrefix(d.source.connection.prefix ?? "", scan.hour),
    key = JSON.stringify([prefix, scan.token]);
  const cache = d.source.listings.get(key),
    ttl =
      scan.hour >= Math.floor(Date.now() / HOUR) * HOUR - HOUR
        ? d.source.settings.refreshIntervalMs
        : d.source.settings.historicalRefreshIntervalMs;
  if (cache && cache.at + ttl > Date.now()) return cache.page;
  const flight = d.source.flights.get("list:" + key) as
    | Promise<ListPage>
    | undefined;
  if (flight) return flight;
  const promise = attempt(d, "list", 0, (signal) =>
    sourceTransport(d.source).list(prefix, scan.token, signal),
  )
    .then((page) => {
      if (page.next && page.next === scan.token)
        throw new Error("Invalid S3 continuation token.");
      d.source.listings.set(key, { page, at: Date.now() });
      if (d.source.listings.size > 1000)
        d.source.listings.delete(d.source.listings.keys().next().value!);
      return page;
    })
    .finally(() => d.source.flights.delete("list:" + key));
  d.source.flights.set("list:" + key, promise);
  return promise;
}
async function objectBody(d: Dataset, object: S3Object): Promise<Buffer> {
  if (object.size <= 0 || object.size > 25 * MB)
    throw new Error("Invalid or oversized object.");
  const key = JSON.stringify([
    d.source.identity,
    object.key,
    object.etag,
    object.size,
  ]);
  const cached = await d.source.cache.get(key, object.size);
  if (cached && cached.length === object.size) {
    d.status.cacheHits++;
    return cached;
  }
  const flight = d.source.flights.get("get:" + key) as
    | Promise<Buffer>
    | undefined;
  if (flight) {
    d.status.cacheHits++;
    return flight;
  }
  const promise = attempt(d, "get", object.size, async (signal) => {
    const body = await sourceTransport(d.source).get(object, signal),
      chunks: Buffer[] = [];
    let bytes = 0;
    const abort = () => {
      const stream = body as { destroy?: () => void };
      stream.destroy?.();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      for await (const chunk of body) {
        signal.throwIfAborted();
        bytes += chunk.byteLength;
        d.status.downloadedBytes += chunk.byteLength;
        if (bytes > object.size) {
          abort();
          throw new Error("Object exceeds listed size.");
        }
        chunks.push(Buffer.from(chunk));
      }
      if (bytes !== object.size) throw new Error("Incomplete S3 object.");
      const content = Buffer.concat(chunks);
      await d.source.cache.set(key, content);
      return content;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }).finally(() => d.source.flights.delete("get:" + key));
  d.source.flights.set("get:" + key, promise);
  return promise;
}
async function load(d: Dataset): Promise<void> {
  while (true) {
    d.controller.signal.throwIfAborted();
    if (
      d.status.decodedBytes >= limit(d, "decodedBytes") ||
      d.status.scannedRecords >= limit(d, "records")
    ) {
      if (!d.partialObject && !d.objects.length && d.scans.every((s) => s.done))
        return;
      throw new BudgetStop(
        "Analysis allowance reached. Load more to continue.",
      );
    }
    if (!d.partialObject && !d.objects.length) {
      const scan = d.scans.find((s) => !s.done);
      if (!scan) return;
      const page = await listing(d, scan);
      scan.started = true;
      scan.at = Date.now();
      scan.token = page.next;
      scan.done = !page.next;
      for (const object of page.objects) {
        const parsed = parseS3ObjectKey(
          object.key,
          d.source.connection.prefix ?? "",
        );
        if (
          !parsed ||
          parsed.maxTimestamp < Date.parse(d.status.from) ||
          parsed.minTimestamp > Date.parse(d.status.to)
        )
          continue;
        const identity = object.etag + ":" + object.size;
        if (d.seen.get(object.key) === identity) continue;
        if (d.seen.has(object.key)) {
          const fileId = createHash("sha256")
            .update(d.source.summary.id + object.key)
            .digest("hex");
          d.records = d.records.filter((r) => r.fileId !== fileId);
          d.files = d.files.filter((f) => f.id !== fileId);
        }
        d.seen.set(object.key, identity);
        d.objects.push(object);
        d.status.discoveredObjects++;
      }
      continue;
    }
    if (!d.partialObject) {
      const object = d.objects[0]!;
      const compressed = await objectBody(d, object);
      const text = gunzipSync(compressed, {
        maxOutputLength: 25 * MB,
      }).toString("utf8");
      const lines = text.split("\n");
      if (lines.at(-1) === "") lines.pop();
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          typeof parsed.timestamp !== "string" ||
          typeof parsed.message !== "string"
        )
          throw new Error("Invalid Blyp record.");
      }
      d.partialObject = { object, lines, index: 0 };
      d.objects.shift();
    }
    const partial = d.partialObject!,
      object = partial.object;
    const fileId = createHash("sha256")
      .update(d.source.summary.id + object.key)
      .digest("hex");
    const uri = `s3://${d.source.connection.bucket}/${object.key}`;
    const file: StudioLogFile = {
      id: fileId,
      absolutePath: uri,
      relativePath: object.key,
      name: object.key.split("/").at(-1)!,
      kind: "archive",
      stream: "combined",
      sizeBytes: object.size,
      modifiedAt: new Date(
        parseS3ObjectKey(
          object.key,
          d.source.connection.prefix ?? "",
        )!.maxTimestamp,
      ).toISOString(),
    };
    const additional: StudioNormalizedRecord[] = [];
    while (partial.index < partial.lines.length) {
      d.controller.signal.throwIfAborted();
      const line = partial.lines[partial.index]!,
        bytes = Buffer.byteLength(line) + 1;
      if (
        d.status.scannedRecords >= limit(d, "records") ||
        d.status.decodedBytes + bytes > limit(d, "decodedBytes")
      ) {
        d.records = [...d.records, ...additional];
        if (!d.files.some((f) => f.id === file.id))
          d.files = [...d.files, file];
        throw new BudgetStop(
          "Analysis allowance reached. Load more to continue.",
        );
      }
      const parsed = JSON.parse(line);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        typeof parsed.timestamp !== "string" ||
        typeof parsed.message !== "string"
      )
        throw new Error("Invalid Blyp record.");
      const normalized = await normalizeRecord({
        file,
        lineNumber: partial.index + 1,
        rawLine: line,
        parsed,
        projectPath: d.source.projectPath,
      });
      const timestamp = Date.parse(normalized.timestamp ?? "");
      if (
        !Number.isFinite(timestamp) ||
        (timestamp >= Date.parse(d.status.from) &&
          timestamp <= Date.parse(d.status.to))
      )
        additional.push(normalized);
      d.status.scannedRecords++;
      d.status.decodedBytes += bytes;
      partial.index++;
    }
    d.records = [...d.records, ...additional];
    if (!d.files.some((f) => f.id === file.id)) d.files = [...d.files, file];
    d.loaded.add(object.key + object.etag);
    d.status.loadedObjects++;
    d.partialObject = undefined;
  }
}
