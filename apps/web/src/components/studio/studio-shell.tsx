import type { ReactNode } from "react";

interface StudioShellProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  detail?: ReactNode;
}

export function StudioShell({ toolbar, sidebar, content, detail }: StudioShellProps) {
  const hasDetail = detail !== null && detail !== undefined;

  return (
    <div className="min-h-full px-4 py-4 text-foreground xl:px-6">
      <div className="mx-auto grid max-w-[1720px] gap-5">
        {toolbar}
        <div
          className={
            hasDetail
              ? "grid gap-5 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)_minmax(21rem,25rem)]"
              : "grid gap-5 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]"
          }
        >
          <div className="min-w-0 space-y-4">{sidebar}</div>
          <div className="min-w-0">{content}</div>
          {hasDetail ? (
            <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">{detail}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
