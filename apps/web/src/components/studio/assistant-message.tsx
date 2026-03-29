import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <Message from={message.role}>
      <MessageContent
        className={cn(
          "w-fit min-w-0 overflow-visible border px-4 shadow-xs",
          isAssistant
            ? "max-w-[80%] gap-3 bg-background py-3"
            : "max-w-[72%] gap-2 border-secondary/60 bg-secondary py-2.5",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isAssistant ? "default" : "outline"}>
            {isAssistant ? "Observability assistant" : "You"}
          </Badge>
          {isAssistant && model ? (
            <Badge variant="secondary" className="max-w-full truncate" title={model}>
              {model}
            </Badge>
          ) : null}
          {streaming ? <Badge variant="muted">Streaming</Badge> : null}
        </div>
        {isAssistant && reasoning ? (
          <Reasoning isStreaming={streaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoning}</ReasoningContent>
          </Reasoning>
        ) : null}
        {content ? (
          <MessageResponse
            className="text-sm leading-6"
            isAnimating={streaming}
            mode={streaming ? "streaming" : "static"}
          >
            {content}
          </MessageResponse>
        ) : null}
        {isAssistant && references.length > 0 ? (
          <ChainOfThought>
            <ChainOfThoughtHeader>Evidence trail</ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              <ChainOfThoughtStep
                label={`${references.length} related logs or groups influenced this answer`}
                description="Jump directly to the referenced evidence."
              >
                <ChainOfThoughtSearchResults>
                  {references.map((reference) => (
                    <Button
                      key={`${reference.kind}:${reference.id}`}
                      variant="outline"
                      size="xs"
                      onClick={() => onReferenceSelect(reference)}
                      title={reference.reason}
                    >
                      <ChainOfThoughtSearchResult>
                        {reference.kind === "group"
                          ? "Group"
                          : reference.kind === "background-run"
                            ? "Run"
                            : "Log"}
                        : {reference.label}
                      </ChainOfThoughtSearchResult>
                    </Button>
                  ))}
                </ChainOfThoughtSearchResults>
              </ChainOfThoughtStep>
            </ChainOfThoughtContent>
          </ChainOfThought>
        ) : null}
      </MessageContent>
    </Message>
  );
}
