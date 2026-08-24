// Auto-generates the "User Guide" — walks the running app with a real
// headless browser, takes screenshots of each screen, and writes a manifest
// consumed by src/app/guide/page.js. Re-run this any time the UI changes:
//
//   npm run dev            (in one terminal)
//   npm run guide          (in another, once the dev server is up)
//
// This is the "auto creation of user guide with screenshots" feature.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "guide");
const MANIFEST_PATH = path.join(ROOT, "src", "data", "guideManifest.json");
const MARKDOWN_PATH = path.join(ROOT, "USER_GUIDE.md");

const BASE_URL = process.env.GUIDE_BASE_URL || "http://localhost:3400";

const steps = [
  {
    file: "01-overview.png",
    path: "/",
    title: "Overview",
    description:
      "The landing page: open/completed/overdue/high-priority counts, recently updated tasks, and shortcuts to Jira Import and Auto Docs.",
  },
  {
    file: "02-task-table.png",
    path: "/tasks",
    title: "Task Table",
    description:
      "Every task in one place — the same columns as the original spreadsheet (Ticket ID, Status, Priority, Assignee, Progress, Comments, Source, and more). Click any column to sort, use the search box to find tasks by title, description, assignee, or even comment text, and \"New task\" is always one click away in the header.",
  },
  {
    file: "03-filters-panel.png",
    path: "/tasks",
    title: "Power search & filters",
    description:
      "The Filters panel combines Status, Priority, Assignee, Source (Jira vs. manual), and due/created date ranges — all combinable, with a one-click \"Clear all filters.\" Filtering, sorting, search, and pagination all work together.",
    action: "openFiltersPanel",
  },
  {
    file: "04-new-task-modal.png",
    path: "/tasks",
    title: "Adding a task",
    description:
      "\"New task\" opens a form covering every field from the tracker, including linking a task as a subtask of another.",
    action: "openNewTaskModal",
  },
  {
    file: "05-task-detail.png",
    path: "/tasks/__FIRST_TASK__",
    title: "Task detail",
    description:
      "Full task view: description, subtasks, and a comment/update history thread — plus a one-click \"Export doc\" button that compiles the whole thing into Markdown.",
  },
  {
    file: "06-board.png",
    path: "/board",
    title: "Board view",
    description:
      "A Kanban board grouped by status. Drag any card to a new column to change its status instantly.",
  },
  {
    file: "07-docs.png",
    path: "/docs",
    title: "Auto Docs",
    description:
      "The auto documenter: every task's description and update history compiled into clean Markdown automatically, previewable per task or exportable as one full project document.",
  },
  {
    file: "08-jira-import.png",
    path: "/jira",
    title: "Jira Import",
    description:
      "Jira connection settings (Base URL, email, API token, project) are configured right here in the UI — no .env editing required. The token is encrypted and stored server-side, never sent to the browser. \"Test connection\" verifies credentials before you rely on them, and the banner up top spells out exactly what an import does: a one-way pull from Jira into Taskar.",
  },
  {
    file: "09-config.png",
    path: "/config",
    title: "Configuration",
    description:
      "Manage the Statuses, Priorities, Types, and Assignees lists that power every dropdown and the Board's columns.",
  },
];

const GUIDE_STEP = {
  file: "10-guide.png",
  path: "/guide",
  title: "This guide, generating itself",
  description:
    "The User Guide page you're looking at is built from this same manifest — regenerated automatically whenever the screenshots above are refreshed.",
};

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  // On a normal machine `npx playwright install` puts Chromium somewhere
  // Playwright finds automatically. PLAYWRIGHT_CHROMIUM_PATH is only needed
  // in sandboxed environments with a pre-cached browser at a nonstandard path.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Resolve the first real task id from the running app so the detail-page
  // screenshot points at real data instead of a 404.
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
  await page.waitForSelector('a[href^="/tasks/"]');
  const firstHref = await page.getAttribute('a[href^="/tasks/"]', "href");
  const firstTaskId = firstHref?.split("/tasks/")[1];

  for (const step of steps) {
    const url = step.path.replace("__FIRST_TASK__", firstTaskId || "");
    await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    if (step.action === "openNewTaskModal") {
      await page.getByRole("button", { name: /new task/i }).first().click();
      await page.waitForTimeout(300);
    }
    if (step.action === "openFiltersPanel") {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(OUT_DIR, step.file) });

    if (step.action === "openNewTaskModal") {
      await page.keyboard.press("Escape").catch(() => {});
    }
    if (step.action === "openFiltersPanel") {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await page.waitForTimeout(200);
    }
    console.log(`captured ${step.file}`);
  }

  // Write the manifest first so the /guide page has content, then screenshot
  // /guide itself (self-referential, but genuinely useful in the guide).
  let manifest = steps.map(({ file, title, description }) => ({
    file: `/guide/${file}`,
    title,
    description,
  }));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  await page.goto(`${BASE_URL}${GUIDE_STEP.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, GUIDE_STEP.file) });
  console.log(`captured ${GUIDE_STEP.file}`);

  await browser.close();

  manifest = [
    ...manifest,
    { file: `/guide/${GUIDE_STEP.file}`, title: GUIDE_STEP.title, description: GUIDE_STEP.description },
  ];
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const md = [
    "# Taskar User Guide",
    "",
    "_Auto-generated by `npm run guide` — re-run it any time the UI changes._",
    "",
    ...manifest.flatMap((s) => [
      `## ${s.title}`,
      "",
      s.description,
      "",
      `![${s.title}](public${s.file})`,
      "",
    ]),
  ].join("\n");
  await writeFile(MARKDOWN_PATH, md);

  console.log(`\nWrote ${manifest.length} screenshots to public/guide/`);
  console.log(`Wrote manifest to ${path.relative(ROOT, MANIFEST_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, MARKDOWN_PATH)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
