import { cn } from "@/lib/utils";

interface TruncatedPathProps {
  value: string;
  variant?: "inline" | "block";
  className?: string;
}

/**
 * Mono file path. The inline variant keeps the basename (and any `:line`
 * suffix) visible and truncates the directory portion, giving a
 * middle-truncation look. The block variant wraps the full path.
 */
export function TruncatedPath({
  value,
  variant = "inline",
  className,
}: TruncatedPathProps) {
  if (variant === "block") {
    return (
      <span
        title={value}
        className={cn(
          "block whitespace-pre-wrap break-all font-mono text-[0.7rem] leading-5 text-muted-foreground",
          className,
        )}
      >
        {value}
      </span>
    );
  }

  const { head, tail } = splitPath(value);

  return (
    <span
      title={value}
      className={cn(
        "flex min-w-0 max-w-full items-baseline whitespace-nowrap font-mono text-[0.7rem] text-muted-foreground",
        className,
      )}
    >
      {head ? <span className="min-w-0 truncate text-muted-foreground/70">{head}</span> : null}
      <span className={cn("min-w-0 text-foreground/80", head ? "shrink-0" : "truncate")}>
        {tail}
      </span>
    </span>
  );
}

function splitPath(value: string): { head: string; tail: string } {
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));

  if (index <= 0 || index === value.length - 1) {
    return { head: "", tail: value };
  }

  return { head: value.slice(0, index + 1), tail: value.slice(index + 1) };
}
