import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAssistantStatus } from "@/lib/studio";
import { getAssistantStatusLabel } from "@/lib/studio";

import { PanelHeader } from "./panel-header";

interface AssistantSetupStateProps {
  status: StudioAssistantStatus;
}

export function AssistantSetupState({ status }: AssistantSetupStateProps) {
  return (
    <Card size="sm" className="border-dashed">
      <PanelHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Sparkles className="size-4" />
            Assistant
          </span>
        }
        description="AI insights run server-side and stay optional."
        action={
          <Badge variant={status.enabled ? "default" : "secondary"}>
            {getAssistantStatusLabel(status)}
          </Badge>
        }
      />
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>
          Studio AI needs an <code>OPENROUTER_API_KEY</code> and a selected model. The
          CLI onboarding can write these into the target project for you.
        </p>
        <p>Studio log browsing and filtering will continue to work without AI.</p>
      </CardContent>
    </Card>
  );
}
