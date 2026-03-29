import type { StudioErrorGroup } from "@/lib/studio";

interface SparklineProps {
  points: StudioErrorGroup["sparklineBuckets"];
  className?: string;
}

export function Sparkline({ points, className }: SparklineProps) {
  const max = Math.max(1, ...points);
  const width = 96;
  const height = 24;

  if (points.length === 0) {
    return <div className={className} />;
  }

  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? width : (index / (points.length - 1)) * width;
      const y = height - (point / max) * (height - 2) - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
