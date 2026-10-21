// Blyp S3 format v1. Keep this SDK-free protocol reader in sync with the
// writer's golden fixtures; Studio can inspect buckets without a core install.
export interface S3Connection {
  bucket: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?:
    | {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
        expiration?: Date;
      }
    | (() => Promise<{
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
        expiration?: Date;
      }>);
}
export interface S3ReadSettings {
  downloadBytes?: number;
  listAttempts?: number;
  getAttempts?: number;
  records?: number;
  decodedBytes?: number;
  maxGrants?: number;
  refreshIntervalMs?: number;
  historicalRefreshIntervalMs?: number;
  cache?: {
    mode?: "disk" | "memory";
    dir?: string;
    maxBytes?: number;
    ttlMs?: number;
  };
}
export function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  const match = /^s3:\/\/([^/?#:@\s]+)(?:\/([^?#]*))?$/.exec(uri);
  if (!match || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,254}$/.test(match[1]!))
    throw new Error(
      "Expected s3://bucket/prefix without credentials, query, or fragment.",
    );
  const prefix = normalizeS3Prefix(decodeURIComponent(match[2] ?? ""));
  return { bucket: match[1]!, prefix };
}
export function normalizeS3Prefix(value = ""): string {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (
    prefix.split("/").some((p) => p === "." || p === "..") ||
    /[\x00-\x1f\\]/.test(prefix)
  )
    throw new Error("Invalid S3 prefix.");
  return prefix;
}
export function s3HourPrefix(prefix: string, timestamp: number): string {
  return [
    prefix,
    "v1",
    new Date(timestamp).toISOString().slice(0, 13).replace(/[-T:]/g, "/"),
    "",
  ]
    .filter((p, i) => i !== 0 || p !== "")
    .join("/");
}
export function parseS3ObjectKey(
  key: string,
  prefix: string,
): { minTimestamp: number; maxTimestamp: number } | null {
  const root = [prefix, "v1/"].filter(Boolean).join("/");
  if (!key.startsWith(root)) return null;
  const match =
    /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{13})-(\d{13})-(\d{13})-[a-zA-Z0-9-]+\.ndjson\.gz$/.exec(
      key.slice(root.length),
    );
  if (!match) return null;
  const minTimestamp = Number(match[6]),
    maxTimestamp = Number(match[7]);
  if (
    minTimestamp > maxTimestamp ||
    Number(match[5]) !== 9_999_999_999_999 - maxTimestamp ||
    s3HourPrefix(prefix, minTimestamp) !==
      key.slice(0, key.lastIndexOf("/") + 1) ||
    Math.floor(minTimestamp / 3_600_000) !==
      Math.floor(maxTimestamp / 3_600_000)
  )
    return null;
  return { minTimestamp, maxTimestamp };
}
