// Keyboard shortcuts, Odoo-style: hold Alt and every control that has one
// shows its key.
//
// Alt is the modifier because it is the one combination the browser itself
// makes little use of inside a page, and because holding it is what reveals
// the hints — a shortcut nobody can discover is a shortcut nobody uses.
//
// There are far more controls in this app than there are keys, so shortcuts
// are scoped rather than global-and-unique. The sidebar's keys are constant
// wherever you are; each page registers its own on top, and a page key wins.
// That way "N" can mean "new task" on one page and "new note" on another
// without either having to know about the other.

export const MODIFIER_LABEL = "Alt";

/**
 * A shortcut key, or null if it is not one we accept.
 *
 * Single printable characters only: a shortcut on a named key like "Enter" or
 * "Tab" would fight the behaviour those keys already have.
 */
export function normalizeShortcutKey(key) {
  if (typeof key !== "string") return null;
  const normalized = key.trim().toLowerCase();
  return normalized.length === 1 ? normalized : null;
}

/** "Alt+N" — how a shortcut is written wherever it is shown. */
export function formatShortcut(key) {
  const normalized = normalizeShortcutKey(key);
  return normalized ? `${MODIFIER_LABEL}+${normalized.toUpperCase()}` : "";
}

const TYPING_TAGS = new Set(["input", "textarea", "select"]);

/**
 * Is the person typing rather than driving the app?
 *
 * Alt+letter in a text box is how several keyboard layouts produce accented
 * characters, and the rich text editor treats the whole document as editable.
 * Firing a shortcut there would eat the keystroke.
 */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  if (TYPING_TAGS.has(tag)) return true;
  return Boolean(target.isContentEditable);
}

/**
 * Which registration a key belongs to.
 *
 * Page registrations win over global ones, so a page can reuse a letter the
 * sidebar already has. Among equals the most recent wins: a modal registering
 * over the page beneath it is the thing the person is looking at.
 */
export function pickShortcut(registrations = [], key) {
  const normalized = normalizeShortcutKey(key);
  if (!normalized) return null;

  const matches = registrations.filter((r) => normalizeShortcutKey(r.key) === normalized);
  if (matches.length === 0) return null;

  const scoped = matches.filter((r) => r.scope === "page");
  const pool = scoped.length > 0 ? scoped : matches;
  return pool[pool.length - 1];
}

/**
 * Keys claimed more than once within the same scope — a real mistake, since
 * only one of them can ever fire. Returned so a test can assert the app has
 * none rather than leaving it to be noticed in use.
 */
export function findConflicts(registrations = []) {
  const seen = new Map();
  const conflicts = [];

  for (const registration of registrations) {
    const key = normalizeShortcutKey(registration.key);
    if (!key) continue;
    const id = `${registration.scope || "global"}:${key}`;
    if (seen.has(id)) {
      conflicts.push({ scope: registration.scope || "global", key, labels: [seen.get(id), registration.label] });
    } else {
      seen.set(id, registration.label);
    }
  }
  return conflicts;
}

/** What the cheatsheet lists: the shortcuts in force, grouped by scope. */
export function groupShortcuts(registrations = []) {
  const live = registrations.filter((r) => normalizeShortcutKey(r.key));
  const inScope = (scope) =>
    live
      .filter((r) => (r.scope || "global") === scope)
      .map((r) => ({ key: normalizeShortcutKey(r.key), label: r.label }))
      .sort((a, b) => a.key.localeCompare(b.key));

  return { page: inScope("page"), global: inScope("global") };
}
