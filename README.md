# Taskar

A personal task tracker built to replace the "Task Tracker (Jira-Ready)"
spreadsheet — same columns (Ticket ID, Type, Status, Priority, Assignee,
dates, progress, GitHub branch, Jira link, comment count, sync source),
same subtask/comment structure, plus:

- **Table + Board views** of every task, both mobile-responsive (the table becomes a card list on small screens; the board scrolls horizontally like any Kanban)
- **Power search, filters, sorting, and pagination** on the Task Table — search spans title, description, assignee, status, priority, and comment text; filters for Status, Priority, Assignee, Source (Jira vs. manual), and due/created date ranges all combine together; every column sorts; results paginate
- **Comments / update history** per task, threaded like the "Task Comments" sheet
- **Configuration page** for the Statuses / Priorities / Types / Assignees lists (drives every dropdown and the Board's columns), like the "Configuration" sheet
- **Auto Docs** — compiles each task's description + update history into clean Markdown automatically, exportable per task or for the whole project (no manual write-ups)
- **Auto-generated User Guide** — a Playwright script walks the real app and captures screenshots, assembling `/guide` and `USER_GUIDE.md` for you
- **Jira Import** — one-way pull (Jira → Taskar) configured entirely from the app's UI (no `.env` editing required), matching the "Jira Sync Setup" sheet's design so nothing you do here can accidentally change Jira

Everything — tasks, comments, configuration, and your Jira connection —
is saved to your account (Clerk sign-in, Postgres storage), so it follows
you to any device or browser you sign in on. Jira credentials in
particular are additionally encrypted at rest (see
[Jira Import setup](#jira-import-setup) below) so the API token never
reaches page JavaScript. It's a Next.js app, so it deploys straight to
Vercel; each new account is seeded with the tasks from your original
spreadsheet on first login.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Project structure

```
src/
  proxy.js        Clerk middleware — gates every route behind sign-in
  app/            Pages (App Router) — one folder per route
    api/state/    Server-side task/comment/config routes, backed by Postgres
    api/jira/     Server-side Jira routes: config, test-connection, import
    sign-in/      sign-up/   Clerk's hosted auth pages
  components/     Shared UI (PageHeader, task form, filters panel, comment thread, badges…)
  context/        TaskContext — task/comment/config state, persisted via /api/state, backed by Postgres
  lib/            db.js (Neon Postgres client), docGenerator.js (Auto Docs), jira.js (Jira REST client),
                   jiraCredentials.js + serverCrypto.js (encrypted Postgres-backed credential store)
  data/           seed.json — your original spreadsheet, imported once per account
scripts/
  generate-guide.mjs   Regenerates the screenshots + /guide + USER_GUIDE.md
  db-migrate.mjs       Creates the Postgres tables (npm run db:migrate)
```

## Jira Import setup

Unlike the first version of this app, Jira is configured **entirely from
the UI** — nothing to edit in `.env` for day-to-day use:

1. Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens
2. Open **Jira Import** in the app (left nav) and fill in the Connection
   settings card: Base URL, email, API token, and Project key.
3. Click **Test connection** to verify the credentials work before relying
   on them — it calls Jira's `/myself` endpoint and reports exactly what
   went wrong if it didn't (bad URL, wrong token, network unreachable, …).
4. Click **Save settings**, then **Import from Jira now**.

**How credentials are stored:** saving settings sends them once, over
HTTPS, to this app's own `/api/jira/config` route, which encrypts the API
token (`src/lib/serverCrypto.js`, AES-256-GCM) and writes everything to a
single `HttpOnly` cookie. That cookie is never readable by page JavaScript
and is only ever sent back to this app's own server routes — not to any
third party. The tradeoff versus a real database: credentials are
per-browser (switching browsers or clearing cookies means reconfiguring)
and, without an `APP_SECRET` environment variable set, the encryption key is
a fixed fallback rather than a real secret. For production use, set
`APP_SECRET` to any long random string in your environment — it's a
one-time deploy-level secret, not something you touch when reconfiguring
Jira day to day.

**Environment variables still work as a fallback** — if you set
`JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` / `JIRA_PROJECT` and never
configure anything in the UI, the app uses those. Saving settings in the UI
always takes priority.

**Import direction is one-way (Jira → Taskar), always.** Clicking "Import
from Jira now" fetches issues matching your JQL (or `project = "<key>"
ORDER BY updated DESC` if you leave JQL blank), creates any that are new
here, and refreshes the fields on ones you've already imported — matched by
Ticket ID. Tasks you created by hand in Taskar are never touched by an
import, and nothing you do in Taskar is ever written back to Jira. This
mirrors the "Sync Direction: Jira → Sheet" setting in the original
spreadsheet.

The "Auto-import" toggle on that page only runs while the tab is open
(browser tabs can't run on a schedule in the background). For always-on
imports once this is deployed, add a [Vercel Cron
Job](https://vercel.com/docs/cron-jobs) that calls:

```
POST https://your-app.vercel.app/api/jira/import
```

— it uses whatever connection settings are currently saved. Note that route
only *fetches and returns* mapped issues; actually persisting the result
server-side on a schedule (rather than merging client-side, as the UI does)
would need a database (see below).

## Task Table: search, filters, sorting, pagination

- **Search** matches ticket ID / Jira key, task title, description,
  assignee, status, priority, and comment text — type once, it checks
  everything.
- **Filters** (the "Filters" button) combine Status, Priority, Assignee,
  Source (Jira-imported vs. manually created), and due-date / created-date
  ranges. All active filters AND together; "Clear all filters" resets them
  in one click.
- **Sorting** — click any column header to sort by it; click again to
  reverse.
- **Pagination** — 10/25/50/100 rows per page.

Note: the table is intentionally flat (not a nested parent/child tree) so
search, sort, and pagination behave predictably together — a subtask still
shows a small "↳ subtask of TICKET-ID" note under its name, and full
parent/subtask navigation lives on each task's detail page.

## Auto Docs

Open **Auto Docs** to preview or export a Markdown write-up of any task
(description + full comment/update history), or export the whole project at
once. This is meant to replace writing status docs by hand — just keep
logging updates on each task's detail page and the doc stays current.

## Regenerating the User Guide

The `/guide` page and `USER_GUIDE.md` are built by an automated script, not
written by hand:

```bash
npm run dev            # in one terminal
npm run guide           # in another, once the dev server is up
```

This opens the real app in a headless browser, walks through every screen
(including opening the Filters panel and the New Task form), takes
screenshots, and rewrites `public/guide/*.png`, `src/data/guideManifest.json`,
and `USER_GUIDE.md`. Run it again any time the UI changes so the guide never
goes stale.

## Deploying to Vercel

```bash
npx vercel
```

Then, optionally, add `APP_SECRET` (a long random string, for encrypting
saved Jira tokens) under **Project → Settings → Environment Variables**.
Everything else — including Jira credentials — can be configured from the
running app itself; no other environment variables are required.

## Mobile / responsive design

Every page works down to a phone-sized viewport: the sidebar becomes a
hamburger-triggered drawer, page headers (with their primary action, like
"New task") stay pinned at the top while you scroll, the Task Table becomes
a card list instead of a shrunken table, forms and modals go full-screen,
and the Board scrolls horizontally like any Kanban board. Board and Task
Table also get a floating "+" button on small screens as a second way to
reach "New task" without scrolling.

## About data storage

Task/comment/configuration data lives in Postgres (Neon, via Vercel
Marketplace), scoped per Clerk account, so it follows you to any device or
browser you sign in on. Jira credentials live in the same database (still
encrypted at rest — see `src/lib/serverCrypto.js`), also per-account. See
[docs/superpowers/specs/2026-08-25-cloud-sync-design.md](docs/superpowers/specs/2026-08-25-cloud-sync-design.md)
for the full design.

The first time a new account signs in on a browser that already has
pre-cloud-sync `localStorage` data, Taskar offers a one-time import of that
data into the account (see `TaskContext.js`) — after that, `localStorage`
is no longer read as a source of truth.
