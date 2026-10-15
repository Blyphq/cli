import { useId } from "react";

import { KeyRound, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAuthSuspiciousPattern } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";

interface AuthSuspiciousPanelProps {
  patterns: StudioAuthSuspiciousPattern[];
  selectedPatternId: string | null;
  onSelect(pattern: StudioAuthSuspiciousPattern): void;
}

type PatternSeverity = "error" | "warn";

const patternMeta: Record<
  StudioAuthSuspiciousPattern["kind"],
  { label: string; severity: PatternSeverity; icon: typeof ShieldAlert }
> = {
  "brute-force": { label: "Brute force", severity: "error", icon: ShieldAlert },
  "invalid-token-spike": { label: "Token spike", severity: "error", icon: KeyRound },
  "concurrent-sessions": { label: "Concurrent sessions", severity: "warn", icon: Users },
};

const severityClasses: Record<PatternSeverity, { surface: string; icon: string }> = {
  error: {
    surface: "border-level-error/30 bg-level-error/[0.06] hover:bg-level-error/[0.1]",
    icon: "border-level-error/25 bg-level-error/10 text-level-error",
  },
  warn: {
    surface: "border-level-warn/30 bg-level-warn/[0.06] hover:bg-level-warn/[0.1]",
    icon: "border-level-warn/25 bg-level-warn/10 text-level-warn",
  },
};

export function AuthSuspiciousPanel({
  patterns,
  selectedPatternId,
  onSelect,
}: AuthSuspiciousPanelProps) {
  if (!patterns.length) {
    return (
      <EmptyState
        title="No suspicious auth patterns"
        description="Studio did not find repeated failures, invalid token spikes, or concurrent sessions."
        size="compact"
        icon={<ShieldCheck />}
      />
    );
  }

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Suspicious Activity"
        description="Auto-detected auth patterns that warrant investigation. Select one to highlight its events in the timeline."
        action={
          <Badge variant="destructive">
            {patterns.length} {patterns.length === 1 ? "alert" : "alerts"}
          </Badge>
        }
      />
      <CardContent className="grid gap-2.5 p-3 lg:grid-cols-2">
        {patterns.map((pattern) => (
          <SuspiciousPatternItem
            key={pattern.id}
            pattern={pattern}
            selected={selectedPatternId === pattern.id}
            onSelect={() => onSelect(pattern)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SuspiciousPatternItem({
  pattern,
  selected,
  onSelect,
}: {
  pattern: StudioAuthSuspiciousPattern;
  selected: boolean;
  onSelect(): void;
}) {
  const id = useId();
  const meta = patternMeta[pattern.kind] ?? patternMeta["brute-force"];
  const severity = severityClasses[meta.severity];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClick={onSelect}
      className={cn(
        "group/alert flex w-full min-w-0 items-start gap-3 rounded-md border p-3 text-left outline-none transition-colors duration-150 ease-out-expo active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-ring/50",
        severity.surface,
        selected && "border-primary/60 shadow-[inset_2px_0_0_var(--signal)]",
      )}
    >
      <span
        aria-hidden
        className={cn("grid size-7 shrink-0 place-items-center rounded-md border", severity.icon)}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span
            id={`${id}-title`}
            className="min-w-0 font-heading text-[0.82rem] font-semibold leading-snug tracking-[-0.01em] text-foreground"
          >
            {pattern.title}
          </span>
          <Badge variant={meta.severity === "error" ? "destructive" : "warning"} className="mt-px">
            {pattern.eventCount} events
          </Badge>
        </span>
        <span
          id={`${id}-description`}
          className="text-pretty text-[0.75rem] leading-relaxed text-muted-foreground"
        >
          {pattern.description}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[0.68rem] text-muted-foreground">{meta.label}</span>
          {pattern.affectedUserId ? (
            <MonoChip title="Affected user" className="bg-background/70 text-foreground/80">
              user {pattern.affectedUserId}
            </MonoChip>
          ) : (
            <MonoChip className="bg-background/70">user unknown</MonoChip>
          )}
          {pattern.affectedIp ? (
            <MonoChip title="Source IP" className="bg-background/70 text-foreground/80">
              ip {pattern.affectedIp}
            </MonoChip>
          ) : null}
        </span>
        <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground/80">
          {formatCompactDateTime(pattern.timestampStart)}
          <span className="px-1 text-muted-foreground/50">→</span>
          {formatCompactDateTime(pattern.timestampEnd)}
        </span>
      </span>
    </button>
  );
}
