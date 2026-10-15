import { useEffect, type ComponentProps, type ReactNode, type Ref } from "react";

import {
  Compass,
  FileText,
  ListChecks,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  StopCircle,
} from "lucide-react";
import { useStickToBottom } from "use-stick-to-bottom";

import { AssistantMessage } from "@/components/studio/assistant-message";
import { AssistantShimmer } from "@/components/studio/assistant-shimmer";
import { AssistantSetupState } from "@/components/studio/assistant-setup-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  StudioAssistantReference,
  StudioAssistantStatus,
  StudioChatMessage,
  StudioChatStatus,
} from "@/lib/studio";
import { isMessageStreaming, shouldShowProjectContextAdvisory } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { PanelSkeleton } from "./studio-skeletons";

interface AssistantPanelProps {
  chatError?: Error;
  draft: string;
  messages: StudioChatMessage[];
  model: string;
  statusState: StudioChatStatus;
  canDescribeSelection: boolean;
  canEdit: boolean;
  scopeLabel: string;
  status: StudioAssistantStatus | undefined;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onDraftChange(value: string): void;
  onModelChange(value: string): void;
  onDescribeSelection(): void;
  onReferenceSelect(reference: StudioAssistantReference): void;
  onSend(): void;
  onQuickAction(prompt: string): void;
  onStop(): void;
}

export function AssistantPanel({
  chatError,
  draft,
  messages,
  model,
  statusState,
  canDescribeSelection,
  canEdit,
  scopeLabel,
  status,
  textareaRef,
  onDraftChange,
  onModelChange,
  onDescribeSelection,
  onReferenceSelect,
  onSend,
  onQuickAction,
  onStop,
}: AssistantPanelProps) {
  const busy = statusState === "submitted" || statusState === "streaming";
  const { contentRef, scrollRef, scrollToBottom } = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  });
  const showShimmer =
    busy &&
    !messages.some(
      (message) => message.role === "assistant" && isMessageStreaming(message),
    );

  useEffect(() => {
    void scrollToBottom({
      animation: "smooth",
      preserveScrollPosition: true,
    });
  }, [messages, scrollToBottom, statusState]);

  if (!status) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <PanelSkeleton rows={5} compact />
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <AssistantSetupState status={status} />
      </div>
    );
  }

  const canSend = !busy && draft.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-border px-4 py-3">
        {shouldShowProjectContextAdvisory(status) ? (
          <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border-strong bg-muted/30 px-3 py-2.5">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
              <div className="font-medium text-foreground">Add project context</div>
              <p>
                Add a <InlineCode>CLAUDE.md</InlineCode> to improve debugging context. Run{" "}
                <InlineCode>blyp skills install claude</InlineCode> in this project.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.75rem] text-foreground" title={scopeLabel}>
              <span className="text-muted-foreground">Current scope: </span>
              <span className="font-mono text-[0.72rem]">{scopeLabel}</span>
            </div>
            <div className="truncate text-[0.7rem] text-muted-foreground">
              The assistant starts from the current filter scope, then pulls
              related records from the wider log corpus when needed.
            </div>
          </div>
          <div className="w-44 shrink-0">
            <Select value={model} onValueChange={(value) => onModelChange(value ?? "")}>
              <SelectTrigger
                aria-label="Model"
                disabled={!canEdit}
                className="h-7 font-mono text-[0.7rem]"
              >
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {status.availableModels.map((option) => (
                  <SelectItem key={option} value={option} className="font-mono text-[0.72rem]">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {chatError ? (
          <ErrorState
            title="Assistant request failed"
            description={chatError.message}
            size="compact"
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 bg-background/60">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-5">
          <div ref={contentRef} className="mx-auto max-w-3xl space-y-5 pb-4">
            {messages.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText />}
                title="No assistant messages yet"
                description="Start this chat by asking about the current assistant scope."
                size="compact"
              />
            ) : (
              messages.map((message) => (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  onReferenceSelect={onReferenceSelect}
                />
              ))
            )}
            {showShimmer ? <AssistantShimmer /> : null}
          </div>
        </div>
      </div>
      <form
        className="space-y-2 border-t border-border bg-card px-3 pt-2.5 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          <QuickActionChip
            disabled={busy || !canDescribeSelection}
            onClick={onDescribeSelection}
            accent
          >
            <Sparkles />
            Describe selection
          </QuickActionChip>
          <QuickActionChip
            disabled={busy}
            onClick={() => onQuickAction("Find related logs in the current scope.")}
          >
            <Search />
            Find related logs
          </QuickActionChip>
          <QuickActionChip
            disabled={busy}
            onClick={() => onQuickAction("Summarize the current filtered view.")}
          >
            <ListChecks />
            Summarize filtered view
          </QuickActionChip>
          <QuickActionChip
            disabled={busy}
            onClick={() => onQuickAction("What should I inspect next?")}
          >
            <Compass />
            Next inspection step
          </QuickActionChip>
        </div>
        <div className="rounded-lg border border-border-strong bg-card shadow-xs transition-colors duration-150 focus-within:border-ring">
          <textarea
            ref={textareaRef}
            value={draft}
            disabled={!canEdit}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (canSend) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder="Ask about these logs, recurring patterns, or what to inspect next."
            className={cn(
              "block min-h-20 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[0.8rem] leading-relaxed outline-none",
              "placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="min-w-0 truncate pl-1 text-[0.68rem] text-muted-foreground">
              Responses stay grounded in the current assistant scope and related
              logs.
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <kbd title="Cmd/Ctrl + Enter to send" className="hidden h-5 items-center rounded-[4px] border border-border bg-muted/50 px-1 font-mono text-[0.62rem] text-muted-foreground sm:inline-flex">
                ⌘↵
              </kbd>
              {busy ? (
                <Button type="button" variant="outline" size="sm" onClick={onStop}>
                  <StopCircle />
                  Stop
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={!canSend}>
                <Send />
                Send
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function QuickActionChip({
  accent = false,
  className,
  ...props
}: ComponentProps<"button"> & { accent?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border border-border-strong bg-card px-2.5 text-[0.7rem] text-foreground/80 transition-colors duration-150 outline-none",
        "hover:border-foreground/25 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        accent && "[&_svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[4px] bg-muted px-1 py-px font-mono text-[0.7rem] text-foreground/90">
      {children}
    </code>
  );
}
