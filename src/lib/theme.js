// Shared between the blocking init script (layout.js) and ThemeToggle.js.
// "system" means "follow the OS" — the only mode with no explicit stored
// class override, resolved live via prefers-color-scheme.
export const THEME_KEY = "taskar:theme";

// Inlined into a <script> tag in the root layout's <head> so it runs before
// first paint — without this, the page would flash light before React
// hydrates and applies the stored/system theme, since the .dark class isn't
// present in the server-rendered HTML.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_KEY}');
    var isDark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`;

export function applyTheme(preference) {
  const isDark =
    preference === "dark" ||
    (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}
