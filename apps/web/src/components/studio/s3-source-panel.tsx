import { useId, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes, type StudioMeta } from "@/lib/studio";
import type { useS3Dataset } from "@/hooks/use-s3-dataset";

const timeRanges = [
  { value: "15", label: "Last 15 minutes" },
  { value: "60", label: "Last hour" },
  { value: "1440", label: "Last 24 hours" },
  { value: "custom", label: "Custom range" },
];

export function S3SourcePanel({
  source,
  dataset,
}: {
  source: NonNullable<StudioMeta["logs"]["s3"]>;
  dataset: ReturnType<typeof useS3Dataset>;
}) {
  const rangeId = useId();
  const followId = useId();
  const [preset, setPreset] = useState("60");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [live, setLive] = useState(true);
  const status = dataset.status,
    loading = dataset.pending || status?.state === "loading";
  const load = () => {
    if (preset === "custom")
      void dataset.open(
        new Date(from).toISOString(),
        new Date(to).toISOString(),
        false,
      );
    else {
      const end = Date.now();
      void dataset.open(
        new Date(end - Number(preset) * 60_000).toISOString(),
        new Date(end).toISOString(),
        live,
      );
    }
  };
  const customValid =
    from &&
    to &&
    Number.isFinite(Date.parse(from)) &&
    Number.isFinite(Date.parse(to)) &&
    Date.parse(from) <= Date.parse(to);
  return (
    <section
      aria-label="S3 source"
      className="mb-5 space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Cloud className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-all font-mono text-sm">{source.uri}</span>
        </div>
        {status ? (
          <span className="text-sm font-medium">
            {status.state === "loading"
              ? "Loading logs"
              : status.complete
                ? "Complete snapshot"
                : status.stale
                  ? "Stale · partial results"
                  : "Partial results"}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <label htmlFor={rangeId}>Time range</label>
          <Select
            items={timeRanges}
            value={preset}
            onValueChange={(value) => {
              if (value !== null) setPreset(value);
            }}
          >
            <SelectTrigger id={rangeId} className="h-9 min-w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeRanges.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" ? (
          <>
            <label className="grid gap-1 text-sm">
              From
              <Input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              To
              <Input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label
            htmlFor={followId}
            className="flex min-h-9 items-center gap-2 text-sm"
          >
            <Checkbox id={followId} checked={live} onCheckedChange={setLive} />
            Follow new logs
          </label>
        )}
        <Button
          onClick={load}
          disabled={loading || (preset === "custom" && !customValid)}
        >
          Load logs
        </Button>
        {status && !loading ? (
          <Button
            variant="outline"
            onClick={() => void dataset.refresh()}
            disabled={status.state === "cancelled"}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        ) : null}
        {status?.state === "loading" ? (
          <Button variant="outline" onClick={() => void dataset.cancel()}>
            Cancel loading
          </Button>
        ) : null}
        {status &&
        !status.complete &&
        status.state !== "loading" &&
        status.canLoadMore ? (
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void dataset.extend()}
          >
            Load more
          </Button>
        ) : null}
      </div>
      <div
        role="status"
        aria-live="polite"
        className="space-y-1 text-sm text-muted-foreground"
      >
        {!status ? (
          <p>
            Select a time range, then load logs. No bucket requests have been
            made. Each load allows up to 16 MiB of downloads with the default
            configuration.
          </p>
        ) : (
          <>
            <p>
              Loaded range: {new Date(status.from).toLocaleString()} –{" "}
              {new Date(status.to).toLocaleString()}
            </p>
            <p>
              {status.loadedRecords.toLocaleString()} records loaded ·{" "}
              {formatBytes(status.downloadedBytes)} downloaded ·{" "}
              {status.cacheHits} cache hits · {status.listAttempts} LIST /{" "}
              {status.getAttempts} GET attempts
            </p>
            <p>
              {status.loadedObjects} batches loaded · {status.scannedHours}/
              {status.totalHours} hours discovered ·{" "}
              {status.lastSyncedAt
                ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
                : "No completed synchronization yet"}
            </p>
            {!status.complete ? (
              <p className="font-medium text-foreground">
                Charts, counts, searches, and AI context cover the loaded
                records only.{" "}
                {status.reason ??
                  "Loading the selected range within its allowance."}
              </p>
            ) : null}
            {!status.canLoadMore &&
            !status.complete &&
            status.state !== "loading" ? (
              <p>
                Narrow the time range or increase the server read limits to
                inspect more records.
              </p>
            ) : null}
          </>
        )}
      </div>
      {dataset.error ? (
        <p role="alert" className="text-sm text-level-error">
          {dataset.error}
        </p>
      ) : null}
    </section>
  );
}
