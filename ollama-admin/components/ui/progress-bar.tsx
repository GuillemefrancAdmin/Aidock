import { cn } from "@/lib/cn";

interface ProgressBarSegment {
  value: number;
  color: string;
}

/** Determinate progress bar for model pulls and long operations. Pass `segments` instead of `value` for a stacked, multi-color bar. */
interface ProgressBarProps {
  value?: number;
  segments?: ProgressBarSegment[];
  max?: number;
  label?: string;
  className?: string;
}

function ProgressBar({ value, segments, max = 100, label, className }: ProgressBarProps) {
  const resolvedSegments: ProgressBarSegment[] =
    segments ?? [{ value: value ?? 0, color: "hsl(var(--primary))" }];
  const total = resolvedSegments.reduce((sum, s) => sum + s.value, 0);
  const percentage = Math.min(100, Math.round((total / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>{label}</span>
          <span>{percentage}%</span>
        </div>
      )}
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]"
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        {resolvedSegments.map((segment, i) => (
          <div
            key={i}
            className="h-full transition-all duration-300"
            style={{
              width: `${Math.min(100, (segment.value / max) * 100)}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export { ProgressBar, type ProgressBarProps, type ProgressBarSegment };
