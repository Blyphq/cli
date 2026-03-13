import { cn } from "@/lib/utils";

interface TruncatedPathProps {
  value: string;
  variant?: "inline" | "block";
  className?: string;
}

export function TruncatedPath({
  value,
  variant = "inline",
  className,
}: TruncatedPathProps) {
  return (
    <span
      title={value}
      className={cn(
        "font-mono text-[11px] text-muted-foreground",
        variant === "inline"
          ? "block truncate whitespace-nowrap"
          : "block whitespace-pre-wrap break-all",
        className,
      )}
    >
      {value}
    </span>
  );
}
