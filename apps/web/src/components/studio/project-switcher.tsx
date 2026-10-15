import { useState } from "react";

import { ChevronsUpDown, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ProjectSwitcherProps {
  absolutePath: string | undefined;
  draftProjectPath: string;
  invalid?: boolean;
  onDraftProjectPathChange(value: string): void;
  onInspect(): void;
}

export function ProjectSwitcher({
  absolutePath,
  draftProjectPath,
  invalid = false,
  onDraftProjectPathChange,
  onInspect,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const name = getProjectName(absolutePath || draftProjectPath);

  const submit = () => {
    onInspect();
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1 px-1">
      <span className="text-[0.7rem] text-muted-foreground">Project</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Switch project"
          className={cn(
            "group/project flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-card px-2.5 text-left text-[0.8rem] shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:border-ring",
            invalid && "border-level-error/50",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                invalid ? "bg-level-error" : "bg-level-ok",
              )}
            />
            <span className="truncate">{name ?? "Choose a project"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/project:text-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,26rem)] gap-0 p-0">
          <div className="border-b border-border px-3 py-2.5">
            <div className="blyp-eyebrow">Inspect project</div>
            {absolutePath ? (
              <p
                className="mt-1.5 truncate font-mono text-[0.7rem] text-muted-foreground"
                title={absolutePath}
              >
                {absolutePath}
              </p>
            ) : null}
          </div>
          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Input
              autoFocus
              className="flex-1 font-mono"
              value={draftProjectPath}
              onChange={(event) => onDraftProjectPathChange(event.currentTarget.value)}
              placeholder="Absolute or relative path"
            />
            <Button type="submit">
              <FolderOpen />
              Inspect
            </Button>
          </form>
          <p className="border-t border-border px-3 py-2 text-[0.7rem] text-muted-foreground">
            Studio reads the project's Blyp config and NDJSON logs locally. Nothing leaves your machine.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getProjectName(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parts = value.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || value;
}
