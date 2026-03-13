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
        <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
          <div className="space-y-4">{sidebar}</div>
          <div>{content}</div>
          <div className="xl:sticky xl:top-4 xl:self-start">{detail}</div>
        </div>
      </div>
    </div>
  );
}
