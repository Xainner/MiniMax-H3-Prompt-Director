export function PanelHeading({
  title,
  aside,
  className = "mb-3",
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 ${className}`}
    >
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
        {title}
      </h2>
      {aside ? (
        <span className="text-muted-foreground text-xs tabular-nums">{aside}</span>
      ) : null}
    </div>
  );
}
