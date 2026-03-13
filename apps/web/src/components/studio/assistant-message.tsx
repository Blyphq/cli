import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAssistantMessage, StudioAssistantReference } from "@/lib/studio";

interface AssistantMessageProps {
  message: StudioAssistantMessage | { id: string; role: "user"; content: string };
  onReferenceSelect(reference: StudioAssistantReference): void;
}

export function AssistantMessage({
  message,
  onReferenceSelect,
}: AssistantMessageProps) {
  const isAssistant = message.role === "assistant";

  return (
    <Card
      size="sm"
      className={isAssistant ? "bg-card" : "border-border/60 bg-muted/30"}
    >
      <CardContent className="space-y-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={isAssistant ? "default" : "outline"}>
            {isAssistant ? "Assistant" : "You"}
          </Badge>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content}
        </div>
        {isAssistant && message.references.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              References
            </div>
            <div className="flex flex-wrap gap-2">
              {message.references.map((reference) => (
                <Button
                  key={`${reference.kind}:${reference.id}`}
                  variant="outline"
                  size="xs"
                  onClick={() => onReferenceSelect(reference)}
                  title={reference.reason}
                >
                  <span className="max-w-[16rem] truncate">
                    {reference.kind === "group" ? "Group" : "Log"}: {reference.label}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
