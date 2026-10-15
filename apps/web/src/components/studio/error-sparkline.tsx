import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";

interface ErrorSparklineProps {
  buckets: number[];
  className?: string;
  /** Accessible summary; decorative by default since counts are shown alongside. */
  label?: string;
}

/** Error-frequency sparkline, stroked in the error level color. */
export function ErrorSparkline({ buckets, className, label }: ErrorSparklineProps) {
  return (
    <Sparkline
      points={buckets}
      color="var(--level-error)"
      label={label}
      className={cn("h-6 w-24", className)}
    />
  );
}
