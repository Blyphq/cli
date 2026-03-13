import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stringifyJson } from "@/lib/studio";

interface JsonDetailBlockProps {
  title: string;
  description?: string;
  value: unknown;
}

export function JsonDetailBlock({ title, description, value }: JsonDetailBlockProps) {
  return (
    <Card size="sm" className="bg-background/70">
      <CardHeader className="border-b border-border/60">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-foreground">
          {stringifyJson(value)}
        </pre>
      </CardContent>
    </Card>
  );
}
