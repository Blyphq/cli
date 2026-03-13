import { Bot, Search, Send, Sparkles, StopCircle } from "lucide-react";

import { AssistantMessage } from "@/components/studio/assistant-message";
import { AssistantShimmer } from "@/components/studio/assistant-shimmer";
import { AssistantSetupState } from "@/components/studio/assistant-setup-state";
import { Badge } from "@/components/ui/badge";
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
import { isMessageStreaming } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { PanelHeader } from "./panel-header";

interface AssistantPanelProps {
  chatError?: Error;
  draft: string;
  messages: StudioChatMessage[];
  model: string;
  statusState: StudioChatStatus;
  canDescribeSelection: boolean;
  selectionLabel: string;
  status: StudioAssistantStatus | undefined;
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
  selectionLabel,
  status,
  onDraftChange,
  onModelChange,
  onDescribeSelection,
  onReferenceSelect,
  onSend,
  onQuickAction,
  onStop,
}: AssistantPanelProps) {
  const busy = statusState === "submitted" || statusState === "streaming";
  const showShimmer =
    busy &&
    !messages.some(
      (message) => message.role === "assistant" && isMessageStreaming(message),
    );

  if (!status) {
    return (
      <EmptyState
        title="Loading assistant"
        description="Checking server-side AI configuration."
      />
    );
  }

  if (!status.enabled) {
    return <AssistantSetupState status={status} />;
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <PanelHeader
          title={
            <span className="flex min-w-0 items-center gap-2">
              <Bot className="size-4" />
              Assistant
            </span>
          }
          description="Ask for patterns, causal chains, blast radius, and next debugging steps."
          action={<Badge variant="default">{selectionLabel}</Badge>}
        />
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="min-w-0 space-y-1">
              <div
                className="truncate text-xs font-medium text-foreground"
                title={selectionLabel}
              >
                Current scope: {selectionLabel}
              </div>
              <div className="text-[11px] text-muted-foreground">
                The assistant starts from the current filter scope, then pulls related
                records from the wider log corpus when needed.
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Model
              </div>
              <Select
                value={model}
                onValueChange={(value) => onModelChange(value ?? "")}
              >
                <SelectTrigger>
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
              onClick={() => onQuickAction("Find similar logs to the current selection.")}
            >
              <Search />
              Find similar logs
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
          <div className="max-h-[32rem] min-h-[18rem] space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <EmptyState
                title="No assistant messages yet"
                description="Describe the current selection or ask a question about the filtered logs."
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
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              placeholder="Ask about these logs, recurring patterns, or what to inspect next."
              className="border-input bg-background min-h-24 w-full resize-y rounded-none border px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                Responses stay grounded in the current selection, filter scope, and related logs.
              </div>
              <Button type="submit" disabled={busy || draft.trim().length === 0}>
                <Send />
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
