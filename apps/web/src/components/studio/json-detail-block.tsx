import { Card, CardContent } from "@/components/ui/card";
import { stringifyJson } from "@/lib/studio";
import { PanelHeader } from "./panel-header";

interface JsonDetailBlockProps {
  title: string;
  description?: string;
  value: unknown;
}

export function JsonDetailBlock({ title, description, value }: JsonDetailBlockProps) {
  return (
    <Card size="sm" className="min-w-0 bg-background/70">
      <PanelHeader title={title} description={description} />
      <CardContent className="min-w-0">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-foreground">
          {stringifyJson(value)}
        </pre>
      </CardContent>
    </Card>
  );
}
