import type { ReactNode } from "react";

import { Bot, ChevronDown, Sparkles, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StudioAgentTaskDetail, StudioAgentTaskStep } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDurationMs,
  formatRelativeToSessionStart,
  formatTokenCount,
  getAgentTaskStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { formatAgentStatus } from "./agent-task-list";
import { EmptyState } from "./empty-state";
import { highlightJson } from "./json-detail-block";
import { PanelHeader } from "./panel-header";
import { MonoChip, StatusDot, type StudioTone } from "./studio-primitives";
import { DetailPanelSkeleton, TimelineSkeleton } from "./studio-skeletons";

interface AgentTaskDetailPanelProps {
  detail: StudioAgentTaskDetail | null | undefined;
  loading?: boolean;
  onAskAi(): void;
}

const ERROR_KIND_LABEL: Record<string, string> = {
  llm: "LLM failure",
  tool: "Tool failure",
  agent: "Agent failure",
  unknown: "Failure",
};

export function AgentTaskDetailPanel({
  detail,
  loading = false,
  onAskAi,
}: AgentTaskDetailPanelProps) {
  if (loading && !detail) {
    return <DetailPanelSkeleton />;
  }

  if (!detail) {
    return (
      <EmptyState
        icon={<Bot />}
        title="Select a task"
        description="Choose an agent task to inspect its timeline, cost, and failure detail."
      />
    );
  }

  const { task, failure } = detail;
  const metrics: Array<{ label: string; value: ReactNode }> = [
    { label: "Started", value: formatCompactDateTime(task.startedAt) },
    { label: "Duration", value: formatDurationMs(task.durationMs) },
    { label: "Steps", value: task.stepCount },
    { label: "Tokens", value: formatTokenCount(task.totalTokens) },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex min-w-0 items-start gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant={getAgentTaskStatusBadgeVariant(task.status)}>
                {formatAgentStatus(task.status)}
              </Badge>
              <MonoChip title="Correlation source">{task.correlationSource}</MonoChip>
            </div>
            <h3 className="font-heading text-[0.98rem] leading-snug font-semibold tracking-[-0.025em] text-pretty break-words text-foreground">
              {task.title}
            </h3>
            <p className="truncate font-mono text-[0.68rem] text-muted-foreground/80" title={task.id}>
              {task.id}
            </p>
          </div>
          {task.status === "FAILED" ? (
            <Button variant="outline" size="xs" className="shrink-0" onClick={onAskAi}>
              <Sparkles aria-hidden />
              Ask AI
            </Button>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 bg-card px-4 py-2.5">
              <dt className="text-[0.7rem] text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 truncate font-mono text-[0.78rem] tabular-nums text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
        {failure ? (
          <div className="flex min-w-0 gap-2.5 border-t border-level-error/30 bg-level-error/[0.06] px-4 py-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-level-error" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 text-[0.7rem] text-muted-foreground">
                <span className="font-medium text-level-error">
                  {ERROR_KIND_LABEL[failure.errorKind] ?? "Failure"}
                </span>
                {failure.failedStepName ? (
                  <span className="font-mono">{`at ${failure.failedStepName}`}</span>
                ) : null}
              </div>
              <p className="text-[0.8rem] leading-relaxed break-words text-foreground">
                {failure.errorMessage ?? "Unknown failure"}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card size="sm" className="min-w-0 gap-0 py-0">
        <PanelHeader
          className="py-3"
          title="Timeline"
          description="Chronological task steps and durations."
          action={
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {detail.steps.length} step{detail.steps.length === 1 ? "" : "s"}
            </span>
          }
        />
        <div className="min-w-0 px-4 py-3">
          {loading && detail.steps.length === 0 ? <TimelineSkeleton rows={5} /> : null}
          {!loading && detail.steps.length === 0 ? (
            <p className="text-[0.8rem] text-muted-foreground">No steps were recorded for this task.</p>
          ) : null}
          <ol className="min-w-0">
            {detail.steps.map((step, index) => (
              <StepItem
                key={step.id}
                step={step}
                taskStartedAt={task.startedAt}
                isLast={index === detail.steps.length - 1}
                live={task.status === "IN_PROGRESS" && index === detail.steps.length - 1}
              />
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function getStepTone(step: StudioAgentTaskStep): StudioTone {
  const status = step.status?.toLowerCase() ?? "";
  if (step.errorMessage || /fail|error|timeout/.test(status)) {
    return "error";
  }
  if (/success|complete|ok|done|finish/.test(status)) {
    return "ok";
  }
  if (/start|progress|running|pending/.test(status)) {
    return "info";
  }
  return "neutral";
}

function formatStepOffset(step: StudioAgentTaskStep, taskStartedAt: string | null): string {
  if (typeof step.offsetMs === "number" && Number.isFinite(step.offsetMs)) {
    return `+${formatDurationMs(step.offsetMs)}`;
  }
  return formatRelativeToSessionStart(step.timestamp, taskStartedAt);
}

function StepItem({
  step,
  taskStartedAt,
  isLast,
  live,
}: {
  step: StudioAgentTaskStep;
  taskStartedAt: string | null;
  isLast: boolean;
  live: boolean;
}) {
  const tone = getStepTone(step);
  const showSummary = step.summary && step.summary !== step.name;
  const showModel = step.model && step.model !== step.name;
  const showTool = step.toolName && step.toolName !== step.name;

  return (
    <li className="relative grid min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3">
      <div aria-hidden className="relative flex justify-center">
        {!isLast ? <span className="absolute top-4 -bottom-1 w-px bg-border" /> : null}
        <StatusDot tone={tone} live={live} className="relative mt-[0.4rem] size-2" />
      </div>
      <Collapsible className={cn("min-w-0", isLast ? "pb-0" : "pb-3")}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="muted" className="min-w-10">
                {step.type}
              </Badge>
              <span
                className={cn(
                  "min-w-0 truncate text-[0.8rem] font-medium",
                  tone === "error" ? "text-level-error" : "text-foreground",
                )}
                title={step.name}
              >
                {step.name}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
              <span className="font-mono tabular-nums text-muted-foreground/80">
                {formatStepOffset(step, taskStartedAt)}
              </span>
              {showSummary ? <span className="min-w-0 truncate">{step.summary}</span> : null}
              {showModel ? <MonoChip title={step.model ?? undefined}>{step.model}</MonoChip> : null}
              {showTool ? <MonoChip title={step.toolName ?? undefined}>{step.toolName}</MonoChip> : null}
              {step.status ? (
                <span className={cn("font-mono", tone === "error" && "text-level-error")}>
                  {step.status}
                </span>
              ) : null}
              {typeof step.totalTokens === "number" ? (
                <span className="font-mono tabular-nums">
                  {formatTokenCount(step.totalTokens)} tok
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-mono text-[0.72rem] tabular-nums text-foreground">
              {formatDurationMs(step.durationMs)}
            </span>
            <CollapsibleTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "xs" }),
                "group/details h-5 px-1.5 text-[0.7rem] text-muted-foreground",
              )}
            >
              Details
              <ChevronDown
                aria-hidden
                className="size-3 transition-transform duration-150 group-data-[panel-open]/details:rotate-180"
              />
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="mt-2 min-w-0 space-y-2">
          {step.inputPreview ? <CodePreview label="Input" text={step.inputPreview} /> : null}
          {step.outputPreview ? <CodePreview label="Output" text={step.outputPreview} /> : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground">
            {typeof step.promptTokens === "number" ? (
              <span>prompt {formatTokenCount(step.promptTokens)}</span>
            ) : null}
            {typeof step.completionTokens === "number" ? (
              <span>completion {formatTokenCount(step.completionTokens)}</span>
            ) : null}
            {typeof step.resultCount === "number" ? <span>results {step.resultCount}</span> : null}
            <span className="text-muted-foreground/80">duration source: {step.durationSource}</span>
          </div>
          {step.errorMessage ? (
            <div className="rounded-md border border-level-error/30 bg-level-error/[0.06] px-2.5 py-2 font-mono text-[0.7rem] leading-5 break-words text-level-error">
              {step.errorMessage}
            </div>
          ) : null}
          {step.rawDetails != null ? (
            <CodePreview label="Raw event" text={JSON.stringify(step.rawDetails, null, 2)} json />
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function CodePreview({ label, text, json }: { label: string; text: string; json?: boolean }) {
  const isJson = json ?? looksLikeJson(text);

  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[0.7rem] text-muted-foreground">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[0.7rem] leading-5 whitespace-pre-wrap break-words text-foreground">
        {isJson ? highlightJson(text) : text}
      </pre>
    </div>
  );
}
