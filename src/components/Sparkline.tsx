import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  stroke?: string;
  height?: number;
  className?: string;
}

const Sparkline = ({ values, stroke = "hsl(var(--primary))", height = 36, className }: SparklineProps) => {
  if (!values || values.length < 2) {
    return (
      <div
        className={cn(
          "h-9 rounded-md border border-dashed border-primary/20 bg-muted/30 flex items-center justify-center text-[10px] font-mono text-muted-foreground",
          className,
        )}
      >
        No activity yet
      </div>
    );
  }

  const width = 100;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
};

export default Sparkline;
