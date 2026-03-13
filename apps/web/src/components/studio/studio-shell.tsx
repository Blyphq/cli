import type { ReactNode } from "react";

interface StudioShellProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  detail: ReactNode;
}

export function StudioShell({ toolbar, sidebar, content, detail }: StudioShellProps) {
  return (
    <div className="min-h-full px-4 py-4 text-foreground">
      <div className="mx-auto grid max-w-[1600px] gap-4">
        {toolbar}
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(20rem,26rem)]">
          <div className="min-w-0 space-y-4">{sidebar}</div>
          <div className="min-w-0">{content}</div>
          <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">{detail}</div>
        </div>
      </div>
    </div>
  );
}
