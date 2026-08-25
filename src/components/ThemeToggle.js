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

  const index = Math.max(0, OPTIONS.findIndex((o) => o.value === theme));

  return (
    <div className="relative inline-flex items-center rounded-full bg-slate-100 p-1 dark:bg-slate-800">
      <div
        className="absolute h-7 w-7 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-slate-950"
        style={{ transform: `translateX(${index * 28}px)` }}
      />
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            theme === value
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
