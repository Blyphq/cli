import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioConfig, StudioMeta } from "@/lib/studio";
import { getStatusClasses } from "@/lib/studio";

import { EmptyState } from "./empty-state";

interface ProjectConfigPanelProps {
  meta: StudioMeta;
  config: StudioConfig | undefined;
}

export function ProjectConfigPanel({ meta, config }: ProjectConfigPanelProps) {
  if (!meta.project.valid) {
    return (
      <EmptyState
        title="Invalid target project"
        description={`${meta.project.absolutePath} is not a valid directory.`}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <CardTitle>Project + Config</CardTitle>
        <CardDescription>Resolved target, Blyp config winner, and effective logging settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <InfoRow label="Target project" value={meta.project.absolutePath} />
        <InfoRow
          label="Config status"
          value={
            <Badge className={getStatusClasses(config?.status ?? "not-found")}>
              {config?.status ?? "not-found"}
            </Badge>
          }
        />
        <InfoRow label="Config file" value={config?.winner?.path ?? "No Blyp config found"} />
        <InfoRow label="Resolved log dir" value={config?.resolved.file.dir ?? meta.logs.logDir} />
        <InfoRow label="Archive dir" value={config?.resolved.file.archiveDir ?? meta.logs.archiveDir} />
        <InfoRow label="Client logging" value={config?.resolved.clientLogging.enabled ? config?.resolved.clientLogging.path : "Disabled"} />
        <InfoRow label="Level" value={config?.resolved.level ?? "info"} />
        <InfoRow label="Pretty logging" value={config?.resolved.pretty ? "Enabled" : "Disabled"} />
        <InfoRow
          label="Rotation"
          value={`${config?.resolved.file.rotation.maxSizeBytes ?? 0} bytes / ${config?.resolved.file.rotation.maxArchives ?? 0} archives`}
        />
        {config?.ignored.length ? (
          <InfoRow
            label="Ignored configs"
            value={config.ignored.map((entry) => entry.path).join("\n")}
          />
        ) : null}
        {config?.loadError ? (
          <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {config.loadError}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap break-words text-sm">{value}</div>
    </div>
  );
}
