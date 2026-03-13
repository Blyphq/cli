import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

export function AssistantShimmer() {
  return (
    <Message from="assistant">
      <MessageContent className="w-full max-w-full rounded-none border border-dashed px-4 py-3">
        <div className="space-y-3">
          <Shimmer className="text-sm">Scanning the selected logs and nearby matches...</Shimmer>
          <ChainOfThought defaultOpen>
            <ChainOfThoughtHeader>Observability trace</ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              <ChainOfThoughtStep
                label="Gathering the selected logs and current filtered view"
                status="active"
              />
              <ChainOfThoughtStep
                label="Correlating nearby records, repeated signals, and related errors"
                status="pending"
              />
              <ChainOfThoughtStep
                label="Drafting a grounded explanation with next inspection steps"
                status="pending"
              />
            </ChainOfThoughtContent>
          </ChainOfThought>
        </div>
      </MessageContent>
    </Message>
  );
}
