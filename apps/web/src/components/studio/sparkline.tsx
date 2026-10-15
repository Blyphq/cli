import { cn } from "@/lib/utils";

interface SparklineProps {
  points: number[];
  className?: string;
  /** Stroke/fill color. Defaults to `currentColor` so callers can tint via text-* classes. */
  color?: string;
  /** Accessible summary. When omitted the chart is decorative. */
  label?: string;
}

const WIDTH = 96;
const HEIGHT = 24;
const PAD_Y = 2;

/**
 * Thin line sparkline with a faint area fill and a hairline baseline, matching the
 * blyp.dev chart language (thin strokes, rule-colored baselines, no heavy gradients).
 */
export function Sparkline({ points, className, color = "currentColor", label }: SparklineProps) {
  const values = points.length === 0 ? [0, 0] : points.length === 1 ? [points[0]!, points[0]!] : points;
  const max = Math.max(1, ...values);
  const empty = values.every((value) => value <= 0);
  const baseline = HEIGHT - 0.5;

  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * WIDTH;
    const y = HEIGHT - PAD_Y - (Math.max(0, value) / max) * (HEIGHT - PAD_Y * 2);
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${WIDTH} ${baseline} L0 ${baseline} Z`;

  return (
    <svg
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("block overflow-visible", className)}
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={baseline}
        y2={baseline}
        stroke="var(--rule)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {empty ? null : (
        <>
          <path d={area} fill={color} fillOpacity={0.12} stroke="none" />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
