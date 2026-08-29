// The Pomodoro cycle: focus, short break, focus, ... with a long break every
// few rounds.
//
// Deliberately a set of pure functions over an explicit phase rather than a
// ticking object. The page keeps only `{ phase, startedAt, completedWork }`
// and derives everything else from the clock, so the countdown stays correct
// across a re-render, a tab switch, or a reload — none of which a JS interval
// survives accurately.

export const DEFAULT_POMODORO = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};

const LABELS = {
  work: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

export function phaseLabel(phase) {
  return LABELS[phase] || LABELS.work;
}

export function phaseSeconds(phase, config = DEFAULT_POMODORO) {
  const minutes =
    phase === "shortBreak"
      ? config.shortBreakMinutes
      : phase === "longBreak"
        ? config.longBreakMinutes
        : config.workMinutes;
  return Math.max(1, Math.round(Number(minutes) || 0)) * 60;
}

/**
 * The phase that follows the one just completed.
 *
 * @param phase          the phase that just finished
 * @param completedWork  how many focus intervals are done, including this one
 */
export function phaseAfter(phase, completedWork, config = DEFAULT_POMODORO) {
  if (phase !== "work") return "work";
  const every = Math.max(1, Number(config.longBreakEvery) || 1);
  return completedWork > 0 && completedWork % every === 0 ? "longBreak" : "shortBreak";
}

export function remainingSeconds(phase, startedAt, now, config = DEFAULT_POMODORO) {
  const total = phaseSeconds(phase, config);
  if (!startedAt) return total;

  const start = Date.parse(startedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return total;

  const elapsed = Math.floor((current - start) / 1000);
  return Math.max(0, total - Math.max(0, elapsed));
}

/** "24:59" — the countdown as shown on the timer face. */
export function formatCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * The `startedAt` that resumes a phase with `remaining` seconds left on it.
 *
 * Pausing cannot simply clear `startedAt` — a phase with no start reads as
 * "not begun", which is indistinguishable from a full reset. Instead the
 * remaining time is kept, and resuming back-dates the start by however much
 * of the phase had already run.
 */
export function resumeStartedAt(phase, remaining, now, config = DEFAULT_POMODORO) {
  const total = phaseSeconds(phase, config);
  const left = Math.min(total, Math.max(0, Number(remaining) || 0));
  const elapsed = total - left;
  const startedMs = Date.parse(now) - elapsed * 1000;
  return new Date(startedMs).toISOString();
}
