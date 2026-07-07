type LoadingStateProps = {
  text?: string;
  width?: number;
  height?: number;
  barCount?: number;
  compact?: boolean;
};

export default function LoadingState({ text = "加载中", width = 58, height = 22, barCount = 5, compact = false }: LoadingStateProps) {
  return (
    <div className={`loading-state ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="bar-loading" style={{ width, height }}>
        {Array.from({ length: barCount }).map((_, index) => (
          <span key={index} style={{ animationDelay: `${index * 0.1}s` }} />
        ))}
      </div>
      <span>{text}</span>
    </div>
  );
}
