import { useState } from "react";

import { Bot, Search, Send, Sparkles } from "lucide-react";

import { AssistantMessage } from "@/components/studio/assistant-message";
import { AssistantSetupState } from "@/components/studio/assistant-setup-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  StudioAssistantMessage,
  StudioAssistantReference,
  StudioAssistantStatus,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

type ChatMessage =
  | StudioAssistantMessage
  | {
      id: string;
      role: "user";
      content: string;
    };

interface AssistantPanelProps {
  busy: boolean;
  messages: ChatMessage[];
  selectionLabel: string;
  status: StudioAssistantStatus | undefined;
  onDescribeSelection(): void;
  onReferenceSelect(reference: StudioAssistantReference): void;
  onSend(content: string): void;
  onQuickAction(prompt: string): void;
}

export function AssistantPanel({
  busy,
  messages,
  selectionLabel,
  status,
  onDescribeSelection,
  onReferenceSelect,
  onSend,
  onQuickAction,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");

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
          description="Ask about the current log view or describe the current selection."
          action={<Badge variant="default">{selectionLabel}</Badge>}
        />
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="xs"
              disabled={busy}
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
          </div>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
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
          </div>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();

              const value = draft.trim();
              if (!value) {
                return;
              }

              onSend(value);
              setDraft("");
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="Ask about these logs, recurring patterns, or what to inspect next."
              className="border-input bg-background min-h-24 w-full resize-y rounded-none border px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                Responses are grounded in the selected context and related logs.
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
