import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

interface RootErrorBoundaryProps {
  error?: unknown;
  reset?: () => void;
}

export function RootErrorBoundary({ error, reset }: RootErrorBoundaryProps) {
  const router = useRouter();
  const errorMessage =
    error instanceof Error ? error.message : "Something went wrong";

  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      router.invalidate();
    }
  };

  return (
    <div className="relative isolate flex h-svh flex-col items-center justify-center gap-5 overflow-hidden p-6 text-center">
      <div
        aria-hidden
        className="blyp-dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_65%)]"
      />
      <span className="grid size-10 place-items-center rounded-lg bg-foreground font-heading text-lg font-bold text-background">
        b
      </span>
      <div className="space-y-2">
        <div className="blyp-eyebrow justify-center">Studio error</div>
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.04em] text-foreground">
          Something went wrong
        </h1>
        <p className="mx-auto max-w-md rounded-md border border-level-error/25 bg-level-error/[0.06] px-3 py-2 font-mono text-[0.75rem] text-level-error">
          {errorMessage}
        </p>
      </div>
      <Button variant="outline" onClick={handleRetry}>
        Try again
      </Button>
    </div>
  );
}
