import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioConfig, StudioMeta } from "@/lib/studio";
import { formatRotation, getStatusClasses } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

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
      <PanelHeader
        title="Project + Config"
        description="Resolved target, Blyp config winner, and effective logging settings."
      />
      <CardContent className="space-y-5">
        <Section
          title="Project"
          items={[
            {
              label: "Target",
              value: <TruncatedPath value={meta.project.absolutePath} variant="block" />,
            },
            {
              label: "Config status",
              value: (
                <Badge className={getStatusClasses(config?.status ?? "not-found")}>
                  {config?.status ?? "not-found"}
                </Badge>
              ),
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
                "No Blyp config found"
              ),
            },
            {
              label: "Client logging",
              value: config?.resolved.clientLogging.enabled ? (
                <TruncatedPath value={config.resolved.clientLogging.path} />
              ) : (
                "Disabled"
              ),
            },
          ]}
        />
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
              value: config?.resolved.level ?? "info",
            },
            {
              label: "Pretty",
              value: config?.resolved.pretty ? "Enabled" : "Disabled",
            },
            {
              label: "Rotation",
              value: formatRotation(
                config?.resolved.file.rotation.maxSizeBytes ?? 0,
                config?.resolved.file.rotation.maxArchives ?? 0,
              ),
            },
          ]}
        />
        {config?.ignored.length ? (
          <div className="space-y-2 border border-border/60 bg-muted/20 p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Ignored configs
            </div>
            <div className="space-y-2">
              {config.ignored.map((entry) => (
                <TruncatedPath key={entry.path} value={entry.path} variant="block" />
              ))}
            </div>
          </div>
        ) : null}
        {config?.loadError ? (
          <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive break-words">
            {config.loadError}
          </div>
        ) : null}
      </CardContent>
    </Card>
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
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <MetaList items={items} />
    </div>
  );
}
