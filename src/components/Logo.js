// Taskar's mark: three columns of differing height sharing a baseline — a
// board reduced to its essentials. It stays legible at favicon size, where a
// more literal glyph (a checklist, a clipboard) turns to mush.
//
// The bars are two-tone rather than one flat colour so the mark still reads
// as *columns* and not a solid block at 16px, and the indigo accent is the
// same one the sidebar and Calendar use for team scope.
export default function Logo({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Taskar"
      className={className}
    >
      <rect width="32" height="32" rx="8" className="fill-slate-900 dark:fill-slate-100" />
      <rect
        x="7"
        y="13"
        width="4.5"
        height="12"
        rx="2.25"
        className="fill-white/60 dark:fill-slate-900/50"
      />
      <rect
        x="13.75"
        y="7"
        width="4.5"
        height="18"
        rx="2.25"
        className="fill-white dark:fill-slate-900"
      />
      <rect x="20.5" y="16" width="4.5" height="9" rx="2.25" className="fill-indigo-400" />
    </svg>
  );
}

// Mark plus name, for the sidebar and drawer headers.
export function Wordmark({ subtitle = "Task tracker" }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <Logo size={32} className="shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Taskar
        </p>
        {subtitle && (
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
