"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";

const ConfirmContext = createContext(null);

// App-wide replacement for window.confirm(): const ok = await confirm({...}).
// A single dialog instance lives here so every caller shares the same
// styled UI instead of each screen building its own modal.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title: options.title || "Are you sure?",
        message: options.message || "",
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        danger: Boolean(options.danger),
      });
    });
  }, []);

  function settle(result) {
    setState(null);
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 dark:bg-black/60"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2.5">
              {state.danger && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950 dark:text-red-400">
                  <TriangleAlert size={18} />
                </div>
              )}
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {state.title}
              </h2>
            </div>
            {state.message && (
              <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{state.message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {state.cancelLabel}
              </button>
              <button
                onClick={() => settle(true)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors ${
                  state.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                }`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
