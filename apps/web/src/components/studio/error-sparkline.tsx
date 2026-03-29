interface ErrorSparklineProps {
  buckets: number[];
}

export function ErrorSparkline({ buckets }: ErrorSparklineProps) {
  const values = buckets.length > 0 ? buckets : [0];
  const max = Math.max(...values, 1);
  const width = 84;
  const height = 24;
  const barWidth = width / values.length;

  return (
    <svg
      aria-hidden
      className="text-primary/70"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      {values.map((value, index) => {
        const x = index * barWidth;
        const barHeight = Math.max(2, (value / max) * height);
        const y = height - barHeight;

        return (
          <rect
            key={`${index}:${value}`}
            x={x + 1}
            y={y}
            width={Math.max(2, barWidth - 2)}
            height={barHeight}
            rx="1.5"
            className="fill-current"
          />
        );
      })}
    </svg>
  );
}
