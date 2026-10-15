import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetaListItem {
  label: string;
  value: ReactNode;
}

interface MetaListProps {
  items: MetaListItem[];
  className?: string;
}

export function MetaList({ items, className }: MetaListProps) {
  return (
    <div className={cn("grid gap-0 divide-y divide-border/70", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid min-w-0 gap-1 py-2 first:pt-0 last:pb-0 md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-3"
        >
          <div className="text-[0.72rem] text-muted-foreground">{item.label}</div>
          <div className="min-w-0 text-[0.8rem] break-words">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
