import { Sparkles } from "lucide-react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type {
  StudioAssistantReference,
  StudioChatMessage,
} from "@/lib/studio";
import { cn } from "@/lib/utils";
import {
  getMessageModel,
  getMessageReasoning,
  getMessageReferences,
  getMessageText,
  isMessageStreaming,
} from "@/lib/studio";

/**
 * Markdown typography for assistant responses. Applied with descendant
 * selectors so it works regardless of Streamdown's own utility classes.
 */
export const ASSISTANT_MARKDOWN_CLASSES = cn(
  "text-[0.82rem] leading-[1.7] text-foreground break-words",
  "[&_p]:my-2.5",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:font-heading [&_h1]:text-[1rem] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em]",
  "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-heading [&_h2]:text-[0.92rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-heading [&_h3]:text-[0.85rem] [&_h3]:font-semibold [&_h3]:tracking-[-0.015em]",
  "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-[0.82rem] [&_h4]:font-semibold",
  "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-1 [&_li]:pl-0.5 [&_li::marker]:text-muted-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/40 [&_a]:underline-offset-2 [&_a:hover]:decoration-primary",
  "[&_:not(pre)>code]:rounded-[4px] [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.74rem] [&_:not(pre)>code]:text-foreground/90",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[0.7rem] [&_pre]:leading-5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.75rem]",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground",
  "[&_td]:border-b [&_td]:border-border/70 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top",
);

interface AssistantMessageProps {
  message: StudioChatMessage;
  onReferenceSelect(reference: StudioAssistantReference): void;
}

export function AssistantMessage({
  message,
  onReferenceSelect,
}: AssistantMessageProps) {
  const isAssistant = message.role === "assistant";
  const content = getMessageText(message);
  const reasoning = getMessageReasoning(message);
  const references = getMessageReferences(message);
  const model = getMessageModel(message);
  const streaming = isMessageStreaming(message);

  if (!isAssistant) {
    return (
      <Message from={message.role} className="blyp-fade-up">
        <span className="sr-only">You</span>
        <MessageContent className="max-w-[80%] rounded-lg bg-primary-soft px-3.5 py-2.5 text-primary-soft-foreground group-[.is-user]:bg-primary-soft group-[.is-user]:px-3.5 group-[.is-user]:py-2.5 group-[.is-user]:text-primary-soft-foreground">
          {content ? (
            <MessageResponse
              className={cn(
                ASSISTANT_MARKDOWN_CLASSES,
                "text-primary-soft-foreground [&_p]:my-1.5 [&_strong]:text-primary-soft-foreground",
              )}
              mode="static"
            >
              {content}
            </MessageResponse>
          ) : null}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from={message.role} className="max-w-full">
      <MessageContent className="w-full max-w-full gap-2.5 overflow-visible">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-primary-soft text-primary-soft-foreground">
            <Sparkles className="size-3" />
          </span>
          <span className="font-heading text-[0.78rem] font-semibold tracking-[-0.01em]">
            Blyp AI
          </span>
          {model ? (
            <span
              className="min-w-0 truncate font-mono text-[0.68rem] text-muted-foreground"
              title={model}
            >
              {model}
            </span>
          ) : null}
          {streaming ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <span className="blyp-live-dot size-1.5 rounded-full bg-level-info" aria-hidden />
              Streaming
            </span>
          ) : null}
        </div>
        <div className="min-w-0 space-y-3 pl-7">
          {reasoning ? (
            <Reasoning isStreaming={streaming} className="mb-0">
              <ReasoningTrigger />
              <ReasoningContent>{reasoning}</ReasoningContent>
            </Reasoning>
          ) : null}
          {content ? (
            <MessageResponse
              className={ASSISTANT_MARKDOWN_CLASSES}
              isAnimating={streaming}
              mode={streaming ? "streaming" : "static"}
            >
              {content}
            </MessageResponse>
          ) : null}
          {references.length > 0 ? (
            <ChainOfThought className="rounded-md border border-border bg-card px-3 py-2.5">
              <ChainOfThoughtHeader>Evidence trail</ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                <ChainOfThoughtStep
                  label={`${references.length} related logs or groups influenced this answer`}
                  description="Jump directly to the referenced evidence."
                >
                  <ChainOfThoughtSearchResults>
                    {references.map((reference) => (
                      <button
                        key={`${reference.kind}:${reference.id}`}
                        type="button"
                        onClick={() => onReferenceSelect(reference)}
                        title={reference.reason}
                        className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border-strong bg-card px-2 text-[0.7rem] text-foreground/85 transition-colors duration-150 outline-none hover:border-primary/40 hover:bg-primary-soft hover:text-primary-soft-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        <span className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground">
                          {getReferenceKindLabel(reference.kind)}
                        </span>
                        <span className="min-w-0 truncate">{reference.label}</span>
                      </button>
                    ))}
                  </ChainOfThoughtSearchResults>
                </ChainOfThoughtStep>
              </ChainOfThoughtContent>
            </ChainOfThought>
          ) : null}
        </div>
      </MessageContent>
    </Message>
  );
}

function getReferenceKindLabel(kind: StudioAssistantReference["kind"]): string {
  switch (kind) {
    case "group":
      return "Group";
    case "background-run":
      return "Run";
    case "agent-task":
      return "Task";
    default:
      return "Log";
  }
}
