import { useEffect, type Ref } from "react";

import { Search, Send, Sparkles, StopCircle } from "lucide-react";
import { useStickToBottom } from "use-stick-to-bottom";

import { AssistantMessage } from "@/components/studio/assistant-message";
import { AssistantShimmer } from "@/components/studio/assistant-shimmer";
import { AssistantSetupState } from "@/components/studio/assistant-setup-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <AssistantSetupState status={status} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 border-b border-border/60 px-4 py-4">
        {shouldShowProjectContextAdvisory(status) ? (
          <Card size="sm" className="border-dashed">
            <CardContent className="space-y-1 px-4 py-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Add project context</div>
              <p>
                Add a <code>CLAUDE.md</code> to improve debugging context. Run{" "}
                <code>blyp skills install claude</code> in this project.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="min-w-0 space-y-1">
            <div
              className="truncate text-xs font-medium text-foreground"
              title={scopeLabel}
            >
              Current scope: {scopeLabel}
            </div>
            <div className="text-[11px] text-muted-foreground">
              The assistant starts from the current filter scope, then pulls
              related records from the wider log corpus when needed.
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Model
            </div>
            <Select value={model} onValueChange={(value) => onModelChange(value ?? "")}>
              <SelectTrigger disabled={!canEdit}>
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {status.availableModels.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="xs"
            disabled={busy || !canDescribeSelection}
            onClick={onDescribeSelection}
          >
            <Sparkles />
            Describe selection
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => onQuickAction("Find related logs in the current scope.")}
          >
            <Search />
            Find related logs
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => onQuickAction("Summarize the current filtered view.")}
          >
            Summarize filtered view
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => onQuickAction("What should I inspect next?")}
          >
            Next inspection step
          </Button>
          {busy ? (
            <Button variant="outline" size="xs" onClick={onStop}>
              <StopCircle />
              Stop
            </Button>
          ) : null}
        </div>
        {chatError ? (
          <ErrorState
            title="Assistant request failed"
            description={chatError.message}
            size="compact"
          />
        ) : null}
      </div>
      <div className="bg-muted/20 min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
          <div ref={contentRef} className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <EmptyState
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
        className="space-y-2 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={!canEdit}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          placeholder="Ask about these logs, recurring patterns, or what to inspect next."
          className={cn(
            "border-input bg-background min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring",
            "placeholder:text-muted-foreground",
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            Responses stay grounded in the current assistant scope and related
            logs.
          </div>
          <Button type="submit" disabled={busy || draft.trim().length === 0}>
            <Send />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
