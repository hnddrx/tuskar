"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { THEME_KEY, applyTheme } from "@/lib/theme";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "Match device" },
];

// Light/Dark/System toggle. "System" is the default (no stored preference)
// and tracks OS changes live; picking Light or Dark stores an explicit
// override in localStorage that wins until the user picks System again.
export default function ThemeToggle() {
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(localStorage.getItem(THEME_KEY) || "system");
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  function select(value) {
    setTheme(value);
    localStorage.setItem(THEME_KEY, value);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          className={`rounded p-1.5 transition-colors ${
            theme === value
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
