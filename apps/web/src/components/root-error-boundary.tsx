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
    <div className="flex h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">{errorMessage}</p>
      <Button variant="outline" onClick={handleRetry}>
        Try again
      </Button>
    </div>
  );
}
