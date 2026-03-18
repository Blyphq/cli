import { Database, FileArchive, FileText, FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioFile, StudioMeta } from "@/lib/studio";
import {
  formatBytes,
  formatDateTime,
  getFileKindBadgeVariant,
  getFileStreamBadgeVariant,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

interface LogFilesPanelProps {
  files: StudioFile[];
  activeFileId: string;
  mode: StudioMeta["logs"]["mode"];
  onSelectFile(fileId: string): void;
}

export function LogFilesPanel({ files, activeFileId, mode, onSelectFile }: LogFilesPanelProps) {
  if (files.length === 0) {
    return (
      <EmptyState
        title={mode === "database" ? "Database source unavailable" : "No log files discovered"}
        description={
          mode === "database"
            ? "Studio could not access the configured database source. Check that your Blyp config adapter is valid and the database is reachable."
            : "Studio looked in the resolved log directory and archive directory, but found no Blyp log files."
        }
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title={mode === "database" ? "Log Source" : "Log Files"}
        description={mode === "database" ? "Active Blyp database source." : "Active and archived Blyp streams."}
      />
      <CardContent className="space-y-2 min-w-0">
        {mode !== "database" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onSelectFile("")}
          >
            <FilterX />
            {activeFileId ? "Show all files" : "All files"}
          </Button>
        )}
        {files.map((file) => {
          const selected = activeFileId === file.id;
          const isDbSource = file.id === "database:primary";

          return (
            <Button
              key={file.id}
              variant="outline"
              size="default"
              onClick={() => onSelectFile(selected ? "" : file.id)}
              className={`h-auto w-full justify-start px-3 py-3 text-left ${selected ? "border-primary/30 bg-primary/10 hover:bg-primary/15" : "border-border/60 bg-background/60 hover:bg-muted/30"}`}
            >
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div
                      className="flex min-w-0 items-center gap-2 text-sm font-medium"
                      title={file.name}
                    >
                      {isDbSource ? (
                        <Database className="size-4" />
                      ) : file.kind === "archive" ? (
                        <FileArchive className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                      <span className="min-w-0 truncate">{file.name}</span>
                    </div>
                    <TruncatedPath value={file.relativePath} />
                  </div>
                  {!isDbSource && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1 sm:max-w-[9rem] sm:justify-end">
                      <Badge variant={getFileKindBadgeVariant(file.kind)}>
                        {file.kind}
                      </Badge>
                      <Badge variant={getFileStreamBadgeVariant(file.stream)}>
                        {file.stream}
                      </Badge>
                    </div>
                  )}
                </div>
                {!isDbSource && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatBytes(file.sizeBytes)}</span>
                    <span className="truncate" title={formatDateTime(file.modifiedAt)}>
                      {formatDateTime(file.modifiedAt)}
                    </span>
                  </div>
                )}
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
