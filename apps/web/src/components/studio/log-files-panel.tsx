import { Database, FileArchive, FileText } from "lucide-react";

import type { StudioFile, StudioMeta } from "@/lib/studio";
import { formatBytes, formatDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

interface LogFilesPanelProps {
  files: StudioFile[];
  activeFileId: string;
  mode: StudioMeta["logs"]["mode"];
  onSelectFile(fileId: string): void;
}

export function LogFilesPanel({ files, activeFileId, mode, onSelectFile }: LogFilesPanelProps) {
  const isDatabase = mode === "database";
  const totalBytes = files.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0);

  if (files.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-strong bg-card/60 p-2.5">
        <div className="text-[0.75rem] font-medium">
          {isDatabase ? "Database source unavailable" : "No log files discovered"}
        </div>
        <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
          {isDatabase
            ? "Check that your Blyp config adapter is valid and the database is reachable."
            : "Studio looked in the resolved log and archive directories but found no Blyp log files."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-2 shadow-xs">
      <div className="flex items-center justify-between px-1 pb-1.5 text-[0.7rem] text-muted-foreground">
        <span>{isDatabase ? "Log source" : "Log files"}</span>
        {!isDatabase ? (
          <span className="font-mono tabular-nums">{formatBytes(totalBytes)}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        {!isDatabase && files.length > 1 ? (
          <FileButton
            selected={!activeFileId}
            onClick={() => onSelectFile("")}
            icon={<FileText />}
            name="All files"
            meta={String(files.length)}
          />
        ) : null}
        {files.map((file) => {
          const selected = activeFileId === file.id;
          const isDbSource = file.id === "database:primary";

          return (
            <FileButton
              key={file.id}
              selected={selected}
              onClick={() => onSelectFile(selected ? "" : file.id)}
              title={`${file.relativePath}${isDbSource ? "" : ` · ${formatDateTime(file.modifiedAt)}`}`}
              icon={
                isDbSource ? (
                  <Database />
                ) : file.kind === "archive" ? (
                  <FileArchive />
                ) : (
                  <FileText />
                )
              }
              name={file.name}
              tone={file.stream === "error" ? "error" : undefined}
              meta={isDbSource ? undefined : formatBytes(file.sizeBytes)}
            />
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-[0.68rem] leading-snug text-muted-foreground">
        {isDatabase
          ? "Reading from your configured database adapter"
          : `NDJSON · ${files.length} ${files.length === 1 ? "stream" : "streams"}`}
      </p>
    </div>
  );
}

function FileButton({
  selected,
  onClick,
  icon,
  name,
  meta,
  title,
  tone,
}: {
  selected: boolean;
  onClick(): void;
  icon: React.ReactNode;
  name: string;
  meta?: string;
  title?: string;
  tone?: "error";
}) {
  return (
    <button
      type="button"
      title={title ?? name}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-[5px] px-1.5 text-left text-[0.72rem] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "bg-muted text-foreground"
          : "text-foreground/75 hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "shrink-0 [&>svg]:size-3.5",
          tone === "error" ? "text-level-error" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{name}</span>
      {meta ? (
        <span className="shrink-0 font-mono text-[0.64rem] tabular-nums text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </button>
  );
}
