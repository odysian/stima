interface SkeletonBlockProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export function SkeletonBlock({
  width = "100%",
  height = "1rem",
  borderRadius = "0.5rem",
  className,
}: SkeletonBlockProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer bg-surface-container-highest ${className ?? ""}`.trim()}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}