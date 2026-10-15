import { useState, type ReactNode } from "react";

import { Check, Copy, FileCode2, FolderX, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioConfig, StudioMeta } from "@/lib/studio";
import { formatRotation, getStatusClasses } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { MonoChip, StatCell, StatStrip, StatusDot } from "./studio-primitives";
import { TruncatedPath } from "./truncated-path";

interface ProjectConfigPanelProps {
  meta: StudioMeta;
  config: StudioConfig | undefined;
}

export function ProjectConfigPanel({ meta, config }: ProjectConfigPanelProps) {
  if (!meta.project.valid) {
    return (
      <EmptyState
        icon={<FolderX />}
        title="Invalid target project"
        description={`${meta.project.absolutePath} is not a valid directory.`}
      />
    );
  }

  const status = config?.status ?? "not-found";
  const destination = config?.resolved.destination ?? "file";
  const aiEnabled = Boolean(config?.resolved.ai.enabled);
  const databaseStatus = config?.resolved.database.status;

  return (
    <div className="min-w-0 space-y-4">
      <StatStrip columns="grid-cols-2 2xl:grid-cols-4">
        <StatCell
          label="Config"
          value={status === "found" ? "Found" : status === "error" ? "Error" : "Default"}
          tone={status === "found" ? "ok" : status === "error" ? "error" : "warn"}
          hint={config?.winner?.type ?? "No config file"}
        />
        <StatCell
          label="Destination"
          value={destination === "database" ? "Database" : "Files"}
          hint={
            destination === "database"
              ? (config?.resolved.database.adapterKind ?? "unknown adapter")
              : "NDJSON"
          }
        />
        <StatCell
          label="Log files"
          value={meta.logs.fileCount.toLocaleString()}
          hint={`${meta.logs.activeFileCount} active · ${meta.logs.archiveFileCount} archived`}
        />
        <StatCell
          label="Studio AI"
          value={aiEnabled ? "On" : "Off"}
          tone={aiEnabled ? "ok" : "neutral"}
          hint={config?.resolved.ai.model ?? "No model selected"}
        />
      </StatStrip>

      <Card className="min-w-0 gap-0 py-0">
        <PanelHeader
          className="py-3"
          title="Project + Config"
          description="Resolved target, Blyp config winner, and effective logging settings."
        />
        <CardContent className="min-w-0 divide-y divide-border px-0">
          <Section
            title="Project"
            items={[
              {
                label: "Target",
                value: <TruncatedPath value={meta.project.absolutePath} variant="block" />,
              },
              {
                label: "Config status",
                value: <Badge className={getStatusClasses(status)}>{status}</Badge>,
              },
            ]}
          />
          <Section
            title="Config"
            items={[
              {
                label: "Config file",
                value: config?.winner?.path ? (
                  <TruncatedPath value={config.winner.path} variant="block" />
                ) : (
                  <Muted>No Blyp config found</Muted>
                ),
              },
              {
                label: "Destination",
                value: <MonoValue>{destination}</MonoValue>,
              },
              {
                label: "Client logging",
                value: config?.resolved.clientLogging.enabled ? (
                  <TruncatedPath value={config.resolved.clientLogging.path} />
                ) : (
                  <Muted>Disabled</Muted>
                ),
              },
              {
                label: "AI model",
                value: config?.resolved.ai.model ? (
                  <MonoValue>{config.resolved.ai.model}</MonoValue>
                ) : (
                  <Muted>Not configured</Muted>
                ),
              },
              {
                label: "AI key source",
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot
                      tone={config?.resolved.ai.apiKeyConfigured ? "ok" : "neutral"}
                    />
                    <MonoValue>{config?.resolved.ai.apiKeySource ?? "missing"}</MonoValue>
                  </span>
                ),
              },
            ]}
          />
          {config?.resolved.destination === "database" ? (
            <Section
              title="Database"
              items={[
                {
                  label: "Destination",
                  value: <Badge className={getStatusClasses("found")}>database</Badge>,
                },
                {
                  label: "Status",
                  value: (
                    <Badge
                      className={getStatusClasses(
                        databaseStatus === "enabled"
                          ? "found"
                          : databaseStatus === "invalid"
                            ? "error"
                            : "not-found",
                      )}
                    >
                      {databaseStatus}
                    </Badge>
                  ),
                },
                {
                  label: "Adapter",
                  value: <MonoValue>{config.resolved.database.adapterKind ?? "unknown"}</MonoValue>,
                },
                ...(config.resolved.database.dialect
                  ? [
                      {
                        label: "Dialect",
                        value: <MonoValue>{config.resolved.database.dialect}</MonoValue>,
                      },
                    ]
                  : []),
                ...(config.resolved.database.adapterKind === "prisma" &&
                config.resolved.database.model
                  ? [
                      {
                        label: "Prisma model",
                        value: <MonoValue>{config.resolved.database.model}</MonoValue>,
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <Section
              title="Logging"
              items={[
                {
                  label: "Resolved log dir",
                  value: (
                    <TruncatedPath
                      value={config?.resolved.file.dir ?? meta.logs.logDir}
                      variant="block"
                    />
                  ),
                },
                {
                  label: "Archive dir",
                  value: (
                    <TruncatedPath
                      value={config?.resolved.file.archiveDir ?? meta.logs.archiveDir}
                      variant="block"
                    />
                  ),
                },
                {
                  label: "Level",
                  value: <MonoValue>{config?.resolved.level ?? "info"}</MonoValue>,
                },
                {
                  label: "Pretty",
                  value: config?.resolved.pretty ? "Enabled" : <Muted>Disabled</Muted>,
                },
                {
                  label: "Rotation",
                  value: (
                    <MonoValue>
                      {formatRotation(
                        config?.resolved.file.rotation.maxSizeBytes ?? 0,
                        config?.resolved.file.rotation.maxArchives ?? 0,
                      )}
                    </MonoValue>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {config?.loadError ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-level-error/30 bg-level-error/[0.06] px-3.5 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-level-error" />
          <div className="min-w-0 space-y-0.5">
            <div className="font-heading text-[0.82rem] font-semibold tracking-[-0.02em] text-foreground">
              Config failed to load
            </div>
            <p className="font-mono text-[0.72rem] leading-5 break-words text-level-error">
              {config.loadError}
            </p>
          </div>
        </div>
      ) : null}

      {config?.rawContent ? (
        <RawConfigBlock path={config.winner?.path ?? null} content={config.rawContent} />
      ) : null}

      {config?.ignored.length ? (
        <Card size="sm" className="min-w-0 gap-0 py-0">
          <PanelHeader
            className="py-3"
            title="Ignored configs"
            description="Other config files were found, but only the winner above is applied."
            action={<MonoChip>{config.ignored.length}</MonoChip>}
          />
          <CardContent className="min-w-0 px-0 group-data-[size=sm]/card:px-0">
            <ul className="divide-y divide-border/70">
              {config.ignored.map((entry) => (
                <li key={entry.path} className="flex min-w-0 items-center gap-2.5 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <TruncatedPath value={entry.path} />
                  </span>
                  <Badge variant="muted">{entry.type}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <section className="min-w-0 space-y-2.5 px-4 py-3.5">
      <h3 className="text-[0.72rem] font-medium text-foreground">{title}</h3>
      <MetaList items={items} />
    </section>
  );
}

function MonoValue({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.75rem] tabular-nums break-all">{children}</span>;
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function RawConfigBlock({ path, content }: { path: string | null; content: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.replace(/\n$/, "").split("\n");
  const gutterWidth = `${String(lines.length).length + 3}ch`;

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="sr-only">Raw config</h3>
        {path ? (
          <TruncatedPath className="flex-1 text-[0.72rem]" value={path} />
        ) : (
          <span className="flex-1 text-[0.72rem] text-muted-foreground">Raw config</span>
        )}
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy config"}
          onClick={() => {
            void navigator.clipboard?.writeText(content).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="grid size-6 place-items-center rounded-[5px] text-muted-foreground transition-colors duration-150 hover:bg-primary-soft hover:text-primary-soft-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <CardContent className="min-w-0 px-0 group-data-[size=sm]/card:px-0">
        <div className="max-h-[28rem] overflow-auto bg-muted/50 py-2">
          <pre className="min-w-max font-mono text-[0.7rem] leading-5">
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid"
                style={{ gridTemplateColumns: `${gutterWidth} minmax(0,1fr)` }}
              >
                <span className="select-none pr-2.5 text-right tabular-nums text-muted-foreground/60">
                  {index + 1}
                </span>
                <code className="whitespace-pre pr-4 text-foreground/85">{line || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
