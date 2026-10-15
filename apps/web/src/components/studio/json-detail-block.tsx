import { useMemo, useState, type ReactNode } from "react";

import { Check, Copy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { stringifyJson } from "@/lib/studio";

import { PanelHeader } from "./panel-header";

interface JsonDetailBlockProps {
  title: string;
  description?: string;
  value: unknown;
}

export function JsonDetailBlock({ title, description, value }: JsonDetailBlockProps) {
  const text = useMemo(() => stringifyJson(value), [value]);

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-2.5"
        title={title}
        description={description}
        action={<CopyButton text={text} />}
      />
      <CardContent className="min-w-0 bg-muted/40 px-0 group-data-[size=sm]/card:px-0">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[0.7rem] leading-5 text-foreground">
          {highlightJson(text)}
        </pre>
      </CardContent>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy JSON"}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="grid size-6 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Minimal JSON syntax coloring using Blyp level tokens. */
export function highlightJson(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN.lastIndex = 0;

  while ((match = JSON_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [token, str, colon, keyword, num] = match;
    const key = nodes.length;
    if (str && colon) {
      nodes.push(
        <span key={key} className="text-foreground">
          {str}
        </span>,
        <span key={`${key}:`} className="text-muted-foreground">
          {colon}
        </span>,
      );
    } else if (str) {
      nodes.push(
        <span key={key} className="text-level-ok">
          {str}
        </span>,
      );
    } else if (keyword) {
      nodes.push(
        <span key={key} className="text-level-warn">
          {keyword}
        </span>,
      );
    } else if (num) {
      nodes.push(
        <span key={key} className="text-level-info">
          {num}
        </span>,
      );
    } else {
      nodes.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
