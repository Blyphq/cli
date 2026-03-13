import { FileArchive, FileText, FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioFile } from "@/lib/studio";
import { formatBytes, formatDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";

interface LogFilesPanelProps {
  files: StudioFile[];
  activeFileId: string;
  onSelectFile(fileId: string): void;
}

export function LogFilesPanel({ files, activeFileId, onSelectFile }: LogFilesPanelProps) {
  if (files.length === 0) {
    return (
      <EmptyState
        title="No log files discovered"
        description="Studio looked in the resolved log directory and archive directory, but found no Blyp log files."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <CardTitle>Log Files</CardTitle>
        <CardDescription>Active and archived Blyp streams.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => onSelectFile("")}
        >
          <FilterX />
          {activeFileId ? "Show all files" : "All files"}
        </Button>
        {files.map((file) => {
          const selected = activeFileId === file.id;

          return (
            <Button
              key={file.id}
              variant="outline"
              size="default"
              onClick={() => onSelectFile(selected ? "" : file.id)}
              className={`h-auto w-full justify-start px-3 py-3 text-left ${selected ? "border-primary/30 bg-primary/10 hover:bg-primary/15" : "border-border/60 bg-background/60 hover:bg-muted/30"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {file.kind === "archive" ? <FileArchive className="size-4" /> : <FileText className="size-4" />}
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{file.relativePath}</div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <Badge variant={file.kind === "archive" ? "secondary" : "muted"}>
                    {file.kind}
                  </Badge>
                  <Badge variant="outline">{file.stream}</Badge>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatBytes(file.sizeBytes)}</span>
                <span>{formatDateTime(file.modifiedAt)}</span>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
