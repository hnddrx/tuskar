export function ProgressBar({ value = 0, className = "" }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const color =
    pct >= 100
      ? "bg-emerald-500"
      : pct >= 50
      ? "bg-blue-500"
      : pct > 0
      ? "bg-amber-500"
      : "bg-slate-300";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 w-full min-w-[60px] overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">
        {pct}%
      </span>
    </div>
  );
}
