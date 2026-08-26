// Captures the screenshots that illustrate the User Guide. The guide's prose
// lives in src/data/guideContent.js and is the source of truth; this script
// only adds a picture to each section and refreshes USER_GUIDE.md.
//
//   npm run dev                                    (in one terminal)
//   GUIDE_STORAGE_STATE=.auth/guide.json npm run guide
//
// Every route sits behind Clerk now, so an unauthenticated run would just
// photograph the sign-in page. Save a signed-in session once:
//
//   npx playwright codegen http://localhost:3400 --save-storage=.auth/guide.json
//
// (sign in in the window it opens, then close it). Add .auth/ to .gitignore —
// that file is a live session token.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_SECTIONS } from "../src/data/guideContent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "guide");
const MANIFEST_PATH = path.join(ROOT, "src", "data", "guideManifest.json");
const MARKDOWN_PATH = path.join(ROOT, "USER_GUIDE.md");

const BASE_URL = process.env.GUIDE_BASE_URL || "http://localhost:3400";
const STORAGE_STATE = process.env.GUIDE_STORAGE_STATE || null;

// Keyed by section id in src/data/guideContent.js. Sections without an entry
// here simply render without a screenshot.
const steps = [
  { id: "overview", file: "01-overview.png", path: "/" },
  { id: "my-tasks", file: "02-my-tasks.png", path: "/tasks" },
  { id: "my-board", file: "03-my-board.png", path: "/board" },
  { id: "task-detail", file: "04-task-detail.png", path: "/tasks/__FIRST_TASK__" },
  { id: "team", file: "05-team-tasks.png", path: "/team/tasks" },
  { id: "calendar", file: "06-calendar.png", path: "/calendar" },
  { id: "notes", file: "07-notes.png", path: "/notes" },
  { id: "docs", file: "08-docs.png", path: "/docs" },
  { id: "jira", file: "09-jira.png", path: "/jira" },
  { id: "config", file: "10-config.png", path: "/config" },
];

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  });
  const page = await context.newPage();

  // Fail loudly rather than silently producing ten screenshots of a login
  // form — that failure mode is easy to miss and poisons the whole guide.
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
  if (/sign-in|sign-up/.test(page.url())) {
    await browser.close();
    throw new Error(
      "Not signed in — the app redirected to its sign-in page.\n" +
        "Save a session first:\n" +
        `  npx playwright codegen ${BASE_URL} --save-storage=.auth/guide.json\n` +
        "then re-run with GUIDE_STORAGE_STATE=.auth/guide.json"
    );
  }

  // Resolve a real task id so the detail screenshot isn't a 404.
  const firstHref = await page
    .getAttribute('a[href^="/tasks/"]', "href")
    .catch(() => null);
  const firstTaskId = firstHref?.split("/tasks/")[1]?.split("?")[0];

  const captured = [];
  for (const step of steps) {
    if (step.path.includes("__FIRST_TASK__") && !firstTaskId) {
      console.warn(`skipped ${step.file} — no task exists to open`);
      continue;
    }
    const url = step.path.replace("__FIRST_TASK__", firstTaskId || "");
    await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, step.file) });
    captured.push(step);
    console.log(`captured ${step.file}`);
  }

  const manifest = captured.map(({ id, file }) => ({ id, file: `/guide/${file}` }));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  await browser.close();

  // USER_GUIDE.md mirrors the on-screen guide: the same prose, with whichever
  // screenshots were captured this run.
  const byId = Object.fromEntries(manifest.map((m) => [m.id, m.file]));
  const md = [
    "# Taskar User Guide",
    "",
    "_Prose lives in `src/data/guideContent.js`; screenshots are refreshed by `npm run guide`._",
    "",
    ...GUIDE_SECTIONS.flatMap((s) => [
      `## ${s.title}`,
      "",
      ...(s.lede ? [`_${s.lede}_`, ""] : []),
      ...s.body.flatMap((p) => [p, ""]),
      ...(s.points ? s.points.map(([t, d]) => `- **${t}** — ${d}`).concat("") : []),
      ...(byId[s.id] ? [`![${s.title}](public${byId[s.id]})`, ""] : []),
    ]),
  ].join("\n");
  await writeFile(MARKDOWN_PATH, md);

  console.log(`\nWrote ${manifest.length} screenshots to public/guide/`);
  console.log(`Wrote manifest to ${path.relative(ROOT, MANIFEST_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, MARKDOWN_PATH)}`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
