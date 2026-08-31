"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatShortcut,
  groupShortcuts,
  isTypingTarget,
  normalizeShortcutKey,
  pickShortcut,
} from "@/lib/shortcuts";

// Alt-key shortcuts, and the hints that make them findable.
//
// Holding Alt reveals a badge on every control that has one — the same idea
// Odoo uses, and the reason the shortcuts are worth having at all: nobody
// reads a list of key bindings, but everybody notices letters appearing on
// the buttons they were about to click.
//
// Registration is by hook rather than by a central table, so a page declares
// its own shortcuts next to the buttons they belong to and they disappear
// with the page. The decisions about which registration wins live in
// lib/shortcuts, where they can be tested without a browser.

const ShortcutContext = createContext(null);

export function useShortcutContext() {
  return useContext(ShortcutContext);
}

/**
 * Claims a shortcut for as long as the calling component is mounted.
 *
 * `scope` defaults to "page": something the current screen offers, which
 * outranks the sidebar's constant keys. Pass "global" for those.
 */
export function useShortcut(key, label, onTrigger, { scope = "page", enabled = true } = {}) {
  const context = useShortcutContext();
  // Kept in a ref so re-registration is not needed every time the handler is
  // redefined by a re-render — which, for an inline arrow function, is every
  // time. Written in an effect rather than during render: a ref set while
  // rendering is not a value React can be trusted to have finished with.
  const handler = useRef(onTrigger);
  useEffect(() => {
    handler.current = onTrigger;
  }, [onTrigger]);

  const register = context?.register;
  useEffect(() => {
    if (!register || !enabled || !normalizeShortcutKey(key)) return undefined;
    return register({ key, label, scope, run: () => handler.current?.() });
  }, [register, key, label, scope, enabled]);
}

/** Whether Alt is being held, so a control can show its key. */
export function useShortcutHints() {
  return Boolean(useShortcutContext()?.hinting);
}

/**
 * The badge shown on a control while Alt is held.
 *
 * It renders nothing at all the rest of the time rather than sitting there
 * dimmed: these appear on buttons that are already busy, and a permanent
 * badge on each would crowd them for the sake of something used occasionally.
 */
export function ShortcutHint({ shortcutKey, className = "" }) {
  const hinting = useShortcutHints();
  const normalized = normalizeShortcutKey(shortcutKey);
  if (!hinting || !normalized) return null;

  return (
    <kbd
      aria-hidden="true"
      className={`ml-1 rounded border border-current/30 bg-current/10 px-1 text-[10px] font-semibold uppercase leading-4 ${className}`}
    >
      {normalized}
    </kbd>
  );
}

export default function ShortcutProvider({ children }) {
  const [hinting, setHinting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // State rather than a ref, because the cheatsheet renders from it. The ref
  // below mirrors it purely so the key handler — which is bound once — can
  // read the current set without being rebound on every registration.
  const [registrations, setRegistrations] = useState([]);
  const latest = useRef(registrations);
  useEffect(() => {
    latest.current = registrations;
  }, [registrations]);

  const register = useCallback((entry) => {
    const record = { ...entry, id: Symbol("shortcut") };
    setRegistrations((all) => [...all, record]);
    return () => setRegistrations((all) => all.filter((r) => r !== record));
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.altKey && !event.ctrlKey && !event.metaKey) setHinting(true);
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;

      // Alt+/ lists what is available, which is the one shortcut worth
      // knowing without being shown.
      if (event.key === "/" || event.key === "?") {
        event.preventDefault();
        setSheetOpen((open) => !open);
        return;
      }

      const match = pickShortcut(latest.current, event.key);
      if (!match) return;
      event.preventDefault();
      match.run();
    }

    function onKeyUp(event) {
      if (!event.altKey) setHinting(false);
    }
    // Alt+Tab and the like take the focus away mid-hold, and the keyup never
    // arrives — without this the hints would stay up until the next keypress.
    function clearHints() {
      setHinting(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearHints);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearHints);
    };
  }, []);

  const value = useMemo(
    () => ({ register, hinting, openSheet: () => setSheetOpen(true) }),
    [register, hinting]
  );

  const grouped = useMemo(() => groupShortcuts(registrations), [registrations]);

  return (
    <ShortcutContext.Provider value={value}>
      {children}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setSheetOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Keyboard shortcuts
            </h2>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
              Hold {formatShortcut("x").split("+")[0]} to see them on the buttons themselves.
            </p>

            <ShortcutList title="This page" items={grouped.page} />
            <ShortcutList title="Anywhere" items={grouped.global} />

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </ShortcutContext.Provider>
  );
}

function ShortcutList({ title, items }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={`${title}-${item.key}`}
            className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400"
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {formatShortcut(item.key)}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
