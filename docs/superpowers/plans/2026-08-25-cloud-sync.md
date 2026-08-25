# Cloud Sync Across Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Taskar's tasks, comments, board configuration, and Jira connection follow the user across devices/browsers by replacing browser-only storage (localStorage + a cookie) with Clerk-authenticated accounts backed by a Neon Postgres database.

**Architecture:** Clerk (Vercel Marketplace) gates every route via `src/proxy.js` and provides `userId`. A small set of `/api/state/*` Route Handlers read/write four Postgres tables (`tasks`, `comments`, `board_config`, `jira_config`), each scoped by `user_id`, via `@neondatabase/serverless` with no ORM. `TaskContext` keeps its exact current public API but swaps its internals from `localStorage` to `fetch` calls against those routes, with a one-time import prompt for a device's pre-existing local data.

**Tech Stack:** Next.js 16.3.2 (App Router, JS not TS), React 19, Clerk (`@clerk/nextjs`), Neon Postgres (`@neondatabase/serverless`), Vercel CLI/Marketplace, npm.

**Spec:** [docs/superpowers/specs/2026-08-25-cloud-sync-design.md](../specs/2026-08-25-cloud-sync-design.md)

## Global Constraints

- This Next.js version (16.3.2) renamed `middleware.js` to **`proxy.js`** — confirmed by reading `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` in this repo. The file lives at `src/proxy.js` (this project uses a `src/` dir), exports a default function taking `(request)`, and a named `config` export with a `matcher`. Do not create `middleware.js` — it will not run.
- Clerk's async Core 3 API applies throughout: `const { userId } = await auth()`, not the old synchronous form.
- No ORM. All SQL is hand-written via `@neondatabase/serverless`'s tagged-template `sql` function — the schema is 4 small tables and this project already avoids extra abstraction layers (see `src/lib/jira.js`, `src/lib/serverCrypto.js` for house style: small, direct, commented only where the *why* isn't obvious).
- No test runner is configured in this project (confirmed: no `test` script in `package.json`, no jest/vitest dependency). Every task's "verify" step is a manual check — via `curl`/`fetch` against the running dev server, or the Browser pane tools — matching the existing precedent in `docs/superpowers/specs/2026-08-24-breadcrumb-navigation-design.md`.
- Package manager is npm (`package-lock.json` present, not `pnpm`/`yarn`).
- All `@/...` imports resolve to `src/...` (see `jsconfig.json`) — keep using that alias, not relative paths, matching every existing file.
- The Vercel CLI is not installed yet; the project is already linked (`.vercel/project.json` exists with `projectName: "taskar"`).
- Node.js v26.5.0 is installed locally — comfortably above the `@neondatabase/serverless` driver's Node 19+ floor.
- Dev server: `npm run dev` (Next.js on `http://localhost:3000`), or use the `taskar-dev` entry already in `.claude/launch.json` with the Browser pane's `preview_start`.

---

### Task 1: Clerk authentication

**Files:**
- Create: `src/proxy.js`
- Create: `src/app/sign-in/[[...sign-in]]/page.js`
- Create: `src/app/sign-up/[[...sign-up]]/page.js`
- Modify: `src/app/layout.js`

**Interfaces:**
- Produces: every route (pages and `/api/*`) requires a signed-in Clerk session except `/sign-in*` and `/sign-up*`. `auth()` from `@clerk/nextjs/server` is available in any Route Handler from this point on. `useAuth()` / `useUser()` from `@clerk/nextjs` are available in any client component.

- [ ] **Step 1: Install the Vercel CLI and confirm the project link**

```bash
npm i -g vercel
vercel link --yes
```
Expected: confirms it's linked to the existing `taskar` project (reads `.vercel/project.json`).

- [ ] **Step 2: Provision Clerk via the Vercel Marketplace**

```bash
vercel integration add clerk --yes --no-claim
```
If this requires finishing setup in a browser (Clerk is often a "connectable" integration — see the marketplace skill), it will say so. If it does: run `vercel integration open clerk`, **stop and ask the user to complete the Clerk account/dashboard step**, then continue once they confirm it's done.

- [ ] **Step 3: Pull the provisioned env vars and install the SDK**

```bash
vercel env pull .env.local --yes
npm install @clerk/nextjs
```
Expected: `.env.local` now contains `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (verify with `grep -o '^[A-Z_]*=' .env.local` — don't print values).

- [ ] **Step 4: Create `src/proxy.js`**

```js
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 5: Create the sign-in and sign-up pages**

```js
// src/app/sign-in/[[...sign-in]]/page.js
import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <SignIn />
    </div>
  );
}
```

```js
// src/app/sign-up/[[...sign-up]]/page.js
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <SignUp />
    </div>
  );
}
```

- [ ] **Step 6: Wrap the root layout in `ClerkProvider`**

Modify `src/app/layout.js`:

```js
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { TaskProvider } from "@/context/TaskContext";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Taskar — Personal Task Tracker",
  description:
    "A personal task tracker with Jira sync, auto documentation, and an auto-generated user guide.",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full">
          <TaskProvider>
            <AppShell>{children}</AppShell>
          </TaskProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

(`AppShell` doesn't yet hide its sidebar on `/sign-in`/`/sign-up` — that's Task 9. For now the sidebar will render around the Clerk widget too; cosmetic only, doesn't block verification.)

- [ ] **Step 7: Verify**

```bash
npm run dev
```
Open the Browser pane (`preview_start` with the `taskar-dev` launch config, or `{url: "http://localhost:3000"}`), navigate to `/`. Expected: redirected to `/sign-in`. Sign up with a test email (Clerk's own hosted form handles verification). Expected: redirected back to `/` and the existing Taskar UI renders (still backed by localStorage — unchanged behavior otherwise). Confirm `read_console_messages` shows no errors.

- [ ] **Step 8: Commit**

```bash
git add src/proxy.js src/app/sign-in src/app/sign-up src/app/layout.js package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add Clerk authentication, gating every route behind sign-in

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Neon Postgres database

**Files:**
- Create: `src/lib/db.js`
- Create: `scripts/db-migrate.mjs`
- Modify: `package.json` (add `db:migrate` script, `dotenv-cli` devDependency)

**Interfaces:**
- Consumes: `DATABASE_URL` env var (provisioned by this task).
- Produces: `getSql()`, `rowToTask(row)`, `rowToComment(row)` exported from `@/lib/db`, used by every route handler in Tasks 3–7 and 10. Four tables exist in Postgres: `tasks`, `comments`, `board_config`, `jira_config` (exact columns below, matching the spec).

- [ ] **Step 1: Provision Neon via the Vercel Marketplace**

```bash
vercel integration add neon --yes --no-claim
vercel env pull .env.local --yes
```
Expected: `.env.local` now also has `DATABASE_URL` (check with `grep -o '^[A-Z_]*=' .env.local`).

- [ ] **Step 2: Install the driver and dotenv-cli, then read the driver's own docs**

```bash
npm install @neondatabase/serverless
npm install -D dotenv-cli
```
Read `node_modules/@neondatabase/serverless/README.md`. Confirm two things before writing any code that depends on them: (a) the exact factory call for a lazy client (this plan assumes `neon(process.env.DATABASE_URL)` returns a tagged-template `sql` function), and (b) the exact API for running multiple statements atomically (this plan assumes `sql.transaction([...])`, used in Tasks 5 and 7). If either differs from what's assumed here, adjust this task and Tasks 5/7 accordingly — note the actual signature in your Task 5 commit message if you had to deviate.

- [ ] **Step 3: Create `src/lib/db.js`**

```js
import { neon } from "@neondatabase/serverless";

let _sql = null;

export function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export function rowToTask(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    startDate: row.start_date,
    targetDate: row.target_date,
    progress: row.progress,
    lastUpdate: row.last_update,
    description: row.description,
    githubBranch: row.github_branch,
    jiraLink: row.jira_link,
    commentCount: row.comment_count,
    syncSource: row.sync_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToComment(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    parentCommentId: row.parent_comment_id,
    created: row.created,
    updated: row.updated,
    author: row.author,
    text: row.text,
    jiraIssueLink: row.jira_issue_link,
    syncSource: row.sync_source,
  };
}
```

Do **not** wrap the return value of `getSql()` in a JS `Proxy` for lazy init — that pattern is known to break auth-library DB adapter checks. The plain `let _sql` singleton above is the safe form.

- [ ] **Step 4: Create `scripts/db-migrate.mjs`**

```js
#!/usr/bin/env node
// Creates Taskar's Postgres tables if they don't already exist. Run with:
//   npm run db:migrate
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  await sql`
    create table if not exists tasks (
      id text primary key,
      user_id text not null,
      ticket_id text not null,
      parent_id text,
      type text not null,
      name text not null,
      status text not null,
      priority text not null,
      assignee text not null,
      start_date text,
      target_date text,
      progress integer not null default 0,
      last_update text,
      description text not null default '',
      github_branch text not null default 'N/A',
      jira_link text,
      comment_count integer not null default 0,
      sync_source text not null default 'Manual',
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`create index if not exists tasks_user_id_idx on tasks (user_id)`;

  await sql`
    create table if not exists comments (
      id text primary key,
      user_id text not null,
      ticket_id text not null,
      parent_comment_id text,
      created text not null,
      updated text not null,
      author text not null,
      text text not null default '',
      jira_issue_link text,
      sync_source text not null default 'Manual'
    )
  `;
  await sql`create index if not exists comments_user_id_idx on comments (user_id)`;
  await sql`create index if not exists comments_ticket_id_idx on comments (ticket_id)`;

  await sql`
    create table if not exists board_config (
      user_id text primary key,
      statuses jsonb not null,
      priorities jsonb not null,
      types jsonb not null,
      assignees jsonb not null
    )
  `;

  await sql`
    create table if not exists jira_config (
      user_id text primary key,
      base_url text not null default '',
      email text not null default '',
      project text not null default '',
      jql text not null default '',
      start_date_field_id text not null default '',
      github_branch_field_id text not null default '',
      api_token_enc text
    )
  `;

  console.log("Migration complete: tasks, comments, board_config, jira_config ready.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 5: Add the `db:migrate` script**

In `package.json`, add under `"scripts"`:
```json
"db:migrate": "dotenv -e .env.local -- node scripts/db-migrate.mjs"
```

- [ ] **Step 6: Run the migration and verify**

```bash
npm run db:migrate
```
Expected output: `Migration complete: tasks, comments, board_config, jira_config ready.`

Verify the tables actually exist:
```bash
npx dotenv -e .env.local -- node -e "const {neon}=require('@neondatabase/serverless'); const sql=neon(process.env.DATABASE_URL); sql\`select table_name from information_schema.tables where table_schema='public'\`.then(r=>console.log(r.map(x=>x.table_name)))"
```
Expected: an array containing `tasks`, `comments`, `board_config`, `jira_config`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.js scripts/db-migrate.mjs package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add Neon Postgres schema and lazy DB client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Read state endpoint

**Files:**
- Create: `src/app/api/state/route.js`

**Interfaces:**
- Consumes: `getSql`, `rowToTask`, `rowToComment` from `@/lib/db` (Task 2); `auth()` from `@clerk/nextjs/server` (Task 1); `seed` from `@/data/seed.json`.
- Produces: `GET /api/state` → `{ tasks: Task[], comments: Comment[], config: {statuses,priorities,types,assignees}, hasSynced: boolean }`. `hasSynced` is `true` once a `board_config` row exists for the user (used by Task 8 to gate the one-time import prompt).

- [ ] **Step 1: Create `src/app/api/state/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask, rowToComment } from "@/lib/db";
import seed from "@/data/seed.json";

export async function GET() {
  const { userId } = await auth();
  const sql = getSql();

  const [configRow] = await sql`
    select * from board_config where user_id = ${userId}
  `;
  const taskRows = await sql`
    select * from tasks where user_id = ${userId} order by created_at asc
  `;
  const commentRows = await sql`
    select * from comments where user_id = ${userId} order by created asc
  `;

  return Response.json({
    tasks: taskRows.map(rowToTask),
    comments: commentRows.map(rowToComment),
    config: configRow
      ? {
          statuses: configRow.statuses,
          priorities: configRow.priorities,
          types: configRow.types,
          assignees: configRow.assignees,
        }
      : seed.config,
    hasSynced: Boolean(configRow),
  });
}
```

- [ ] **Step 2: Verify**

With the dev server running and signed in (Task 1), open the Browser pane on the app and use `javascript_tool` to run:
```js
fetch('/api/state').then(r => r.json())
```
Expected: `{ tasks: [], comments: [], config: { statuses: [...], priorities: [...], ... }, hasSynced: false }` — empty arrays and `hasSynced: false` since no rows exist yet, `config` matching `src/data/seed.json`'s `config`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/state/route.js
git commit -m "$(cat <<'EOF'
Add GET /api/state, reading a signed-in user's tasks/comments/config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Task write routes

**Files:**
- Create: `src/app/api/state/tasks/route.js`
- Create: `src/app/api/state/tasks/[id]/route.js`

**Interfaces:**
- Consumes: `getSql`, `rowToTask` from `@/lib/db`; `auth()`.
- Produces: `POST /api/state/tasks` (body: full task record with `id`) → 201 + the inserted row. `PATCH /api/state/tasks/:id` (body: a *partial* patch, e.g. `{status: "Done", lastUpdate, updatedAt}`) → merges against the existing DB row server-side and returns the full updated row (404 if not found/not owned). `DELETE /api/state/tasks/:id` → cascades: deletes the task's comments, clears `parent_id` on its children, deletes the task.

- [ ] **Step 1: Create `src/app/api/state/tasks/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const task = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into tasks (
      id, user_id, ticket_id, parent_id, type, name, status, priority,
      assignee, start_date, target_date, progress, last_update, description,
      github_branch, jira_link, comment_count, sync_source, created_at, updated_at
    ) values (
      ${task.id}, ${userId}, ${task.ticketId}, ${task.parentId}, ${task.type},
      ${task.name}, ${task.status}, ${task.priority}, ${task.assignee},
      ${task.startDate}, ${task.targetDate}, ${task.progress}, ${task.lastUpdate},
      ${task.description}, ${task.githubBranch}, ${task.jiraLink},
      ${task.commentCount}, ${task.syncSource}, ${task.createdAt}, ${task.updatedAt}
    )
    returning *
  `;

  return Response.json(rowToTask(row), { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/state/tasks/[id]/route.js`**

The server merges the incoming patch against the row it already has — the client never needs to send a full task object, which sidesteps needing fresh React state inside a callback (see Task 8).

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from tasks where id = ${id} and user_id = ${userId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const merged = { ...rowToTask(existing), ...patch };

  const [row] = await sql`
    update tasks set
      ticket_id = ${merged.ticketId},
      parent_id = ${merged.parentId},
      type = ${merged.type},
      name = ${merged.name},
      status = ${merged.status},
      priority = ${merged.priority},
      assignee = ${merged.assignee},
      start_date = ${merged.startDate},
      target_date = ${merged.targetDate},
      progress = ${merged.progress},
      last_update = ${merged.lastUpdate},
      description = ${merged.description},
      github_branch = ${merged.githubBranch},
      jira_link = ${merged.jiraLink},
      comment_count = ${merged.commentCount},
      sync_source = ${merged.syncSource},
      updated_at = ${merged.updatedAt}
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToTask(row));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  await sql`delete from comments where ticket_id = ${id} and user_id = ${userId}`;
  await sql`update tasks set parent_id = null where parent_id = ${id} and user_id = ${userId}`;
  await sql`delete from tasks where id = ${id} and user_id = ${userId}`;

  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

In the Browser pane, signed in, via `javascript_tool`:
```js
fetch('/api/state/tasks', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    id: 'task-verify-1', ticketId: 'N/A', parentId: null, type: 'Task',
    name: 'Verify task write route', status: 'Not Started', priority: 'Normal',
    assignee: 'Unassigned', startDate: null, targetDate: null, progress: 0,
    lastUpdate: '2026-08-25', description: '', githubBranch: 'N/A', jiraLink: null,
    commentCount: 0, syncSource: 'Manual', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}).then(r => r.json())
```
Expected: 201 with the row echoed back, `ticketId: "N/A"` etc. Then:
```js
fetch('/api/state/tasks/task-verify-1', {
  method: 'PATCH', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ status: 'Done' }),
}).then(r => r.json())
```
Expected: full task object with `status: "Done"` and every other field unchanged (proves the server-side merge works). Then:
```js
fetch('/api/state/tasks/task-verify-1', { method: 'DELETE' }).then(r => r.json())
```
Expected: `{ ok: true }`. Re-run `fetch('/api/state').then(r=>r.json())` — `tasks` should not contain `task-verify-1`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/state/tasks
git commit -m "$(cat <<'EOF'
Add task create/update/delete API routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Comment write routes

**Files:**
- Create: `src/app/api/state/comments/route.js`
- Create: `src/app/api/state/comments/[id]/route.js`

**Interfaces:**
- Consumes: `getSql`, `rowToComment` from `@/lib/db`; `auth()`; `sql.transaction([...])` (confirmed in Task 2, Step 2).
- Produces: `POST /api/state/comments` (body: full comment record with `id`) → 201 + inserted row, and atomically increments the parent task's `comment_count`. `DELETE /api/state/comments/:id?taskId=...` → deletes the comment and atomically decrements (floor 0) the task's `comment_count`.

- [ ] **Step 1: Create `src/app/api/state/comments/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToComment } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const comment = await request.json();
  const sql = getSql();

  const results = await sql.transaction([
    sql`
      insert into comments (
        id, user_id, ticket_id, parent_comment_id, created, updated,
        author, text, jira_issue_link, sync_source
      ) values (
        ${comment.id}, ${userId}, ${comment.ticketId}, ${comment.parentCommentId},
        ${comment.created}, ${comment.updated}, ${comment.author}, ${comment.text},
        ${comment.jiraIssueLink}, ${comment.syncSource}
      )
      returning *
    `,
    sql`
      update tasks set comment_count = comment_count + 1
      where id = ${comment.ticketId} and user_id = ${userId}
    `,
  ]);

  const row = results[0][0];
  return Response.json(rowToComment(row), { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/state/comments/[id]/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  await sql.transaction([
    sql`delete from comments where id = ${id} and user_id = ${userId}`,
    sql`
      update tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and user_id = ${userId}
    `,
  ]);

  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

Reuse the task created in Task 4's verification (recreate it if it was deleted — re-run the POST from Task 4 Step 3). Then, in the Browser pane console:
```js
fetch('/api/state/comments', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    id: 'comment-verify-1', ticketId: 'task-verify-1', parentCommentId: null,
    created: new Date().toISOString(), updated: new Date().toISOString(),
    author: 'Me', text: 'Verifying comment route', jiraIssueLink: null, syncSource: 'Manual',
  }),
}).then(r => r.json())
```
Expected: 201 with the comment echoed back. Then `fetch('/api/state').then(r=>r.json())` — the task's `commentCount` should now be `1`. Then:
```js
fetch('/api/state/comments/comment-verify-1?taskId=task-verify-1', { method: 'DELETE' }).then(r => r.json())
```
Expected: `{ ok: true }`, and a follow-up `fetch('/api/state')` shows `commentCount` back to `0` and no comments. Clean up: `fetch('/api/state/tasks/task-verify-1', {method:'DELETE'})`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/state/comments
git commit -m "$(cat <<'EOF'
Add comment create/delete API routes with atomic comment-count updates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Config route

**Files:**
- Create: `src/app/api/state/config/route.js`

**Interfaces:**
- Consumes: `getSql` from `@/lib/db`; `auth()`.
- Produces: `PUT /api/state/config` (body: `{ key: "statuses"|"priorities"|"types"|"assignees", values: string[] }`) → upserts `board_config`, merging `key` against whatever's already stored (400 on an invalid `key`).

- [ ] **Step 1: Create `src/app/api/state/config/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const ALLOWED_KEYS = ["statuses", "priorities", "types", "assignees"];

export async function PUT(request) {
  const { userId } = await auth();
  const { key, values } = await request.json();
  const sql = getSql();

  if (!ALLOWED_KEYS.includes(key)) {
    return Response.json({ error: "Invalid config key" }, { status: 400 });
  }

  const [existing] = await sql`
    select * from board_config where user_id = ${userId}
  `;
  const base = existing
    ? {
        statuses: existing.statuses,
        priorities: existing.priorities,
        types: existing.types,
        assignees: existing.assignees,
      }
    : { statuses: [], priorities: [], types: [], assignees: [] };
  const merged = { ...base, [key]: values };

  await sql`
    insert into board_config (user_id, statuses, priorities, types, assignees)
    values (
      ${userId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb,
      ${JSON.stringify(merged.types)}::jsonb,
      ${JSON.stringify(merged.assignees)}::jsonb
    )
    on conflict (user_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types,
      assignees = excluded.assignees
  `;

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify**

```js
fetch('/api/state/config', {
  method: 'PUT', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ key: 'statuses', values: ['Not Started', 'In Progress', 'Done', 'Archived'] }),
}).then(r => r.json())
```
Expected: `{ ok: true }`. Then `fetch('/api/state').then(r=>r.json())` — `config.statuses` includes `"Archived"`, and `config.priorities`/`types`/`assignees` are still present (proves the merge-against-existing worked, not just an overwrite of the one key). Try `{ key: 'bogus', values: [] }` — expect a 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/state/config
git commit -m "$(cat <<'EOF'
Add PUT /api/state/config for board config (statuses/priorities/types/assignees)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Bulk import and reset routes

**Files:**
- Create: `src/app/api/state/import/route.js`
- Create: `src/app/api/state/reset/route.js`

**Interfaces:**
- Consumes: `getSql` from `@/lib/db`; `auth()`; `sql.transaction([...])`.
- Produces: `POST /api/state/import` (body: `{ tasks, comments, config }`, the shape of a legacy localStorage payload) → bulk-inserts everything atomically; 409 if the account already has a `board_config` row (import is one-time only). `POST /api/state/reset` → atomically deletes all of the user's tasks, comments, and board_config (used by the existing "Reset to imported data" feature).

- [ ] **Step 1: Create `src/app/api/state/import/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const payload = await request.json();
  const sql = getSql();

  const [existing] = await sql`select 1 from board_config where user_id = ${userId}`;
  if (existing) {
    return Response.json(
      { error: "This account has already been synced; import is only offered once." },
      { status: 409 }
    );
  }

  const config = payload.config || {};
  const tasks = payload.tasks || [];
  const comments = payload.comments || [];

  const queries = [
    sql`
      insert into board_config (user_id, statuses, priorities, types, assignees)
      values (
        ${userId}, ${JSON.stringify(config.statuses || [])}::jsonb,
        ${JSON.stringify(config.priorities || [])}::jsonb,
        ${JSON.stringify(config.types || [])}::jsonb,
        ${JSON.stringify(config.assignees || [])}::jsonb
      )
    `,
    ...tasks.map(
      (task) => sql`
        insert into tasks (
          id, user_id, ticket_id, parent_id, type, name, status, priority,
          assignee, start_date, target_date, progress, last_update, description,
          github_branch, jira_link, comment_count, sync_source, created_at, updated_at
        ) values (
          ${task.id}, ${userId}, ${task.ticketId}, ${task.parentId || null}, ${task.type},
          ${task.name}, ${task.status}, ${task.priority}, ${task.assignee},
          ${task.startDate || null}, ${task.targetDate || null}, ${task.progress || 0},
          ${task.lastUpdate || null}, ${task.description || ""}, ${task.githubBranch || "N/A"},
          ${task.jiraLink || null}, ${task.commentCount || 0}, ${task.syncSource || "Manual"},
          ${task.createdAt}, ${task.updatedAt}
        )
      `
    ),
    ...comments.map(
      (comment) => sql`
        insert into comments (
          id, user_id, ticket_id, parent_comment_id, created, updated,
          author, text, jira_issue_link, sync_source
        ) values (
          ${comment.id}, ${userId}, ${comment.ticketId}, ${comment.parentCommentId || null},
          ${comment.created}, ${comment.updated}, ${comment.author}, ${comment.text || ""},
          ${comment.jiraIssueLink || null}, ${comment.syncSource || "Manual"}
        )
      `
    ),
  ];

  await sql.transaction(queries);

  return Response.json({ imported: { tasks: tasks.length, comments: comments.length } });
}
```

- [ ] **Step 2: Create `src/app/api/state/reset/route.js`**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function POST() {
  const { userId } = await auth();
  const sql = getSql();

  await sql.transaction([
    sql`delete from comments where user_id = ${userId}`,
    sql`delete from tasks where user_id = ${userId}`,
    sql`delete from board_config where user_id = ${userId}`,
  ]);

  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

```js
fetch('/api/state/import', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    tasks: [{ id: 'import-verify-1', ticketId: 'N/A', type: 'Task', name: 'Imported', status: 'Not Started', priority: 'Normal', assignee: 'Unassigned', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    comments: [],
    config: { statuses: ['Not Started'], priorities: ['Normal'], types: ['Task'], assignees: [] },
  }),
}).then(r => r.json())
```
Expected: `{ imported: { tasks: 1, comments: 0 } }`. Re-run the same call — expect a 409 (`already been synced`). Then:
```js
fetch('/api/state/reset', { method: 'POST' }).then(r => r.json())
```
Expected: `{ ok: true }`. `fetch('/api/state')` afterward shows `tasks: []`, `hasSynced: false` again.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/state/import src/app/api/state/reset
git commit -m "$(cat <<'EOF'
Add one-time bulk import and full reset API routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: TaskContext backend swap

**Files:**
- Modify: `src/context/TaskContext.js` (full rewrite of its internals; public API unchanged)

**Interfaces:**
- Consumes: `useAuth()` from `@clerk/nextjs` (Task 1); every `/api/state/*` route from Tasks 3–7.
- Produces: `useTasks()` still returns `{ tasks, comments, config, hydrated, addTask, updateTask, deleteTask, addComment, deleteComment, updateConfig, mergeJiraIssues, resetToSeed }` — identical shape to today — plus three new fields: `syncError` (string|null), `retrySync()`, `dismissSyncError()`, consumed by Task 9's banner.

This is the highest-risk task in the plan: every mutator must build its API request payload *before* calling `setState`, never by reading state back out of a `setState` updater function afterward — React does not run a state-updater function synchronously inside the `setState()` call, so a variable assigned inside one and read on the next line is not reliably populated yet. Every mutator below follows this rule.

- [ ] **Step 1: Rewrite `src/context/TaskContext.js`**

```js
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useAuth } from "@clerk/nextjs";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";

const TaskContext = createContext(null);
const IMPORT_OFFERED_KEY = "taskar:import-offered:v1";

async function fetchState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`Failed to load state (${res.status})`);
  return res.json();
}

function readLegacyLocalState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return {
      tasks: parsed.tasks,
      comments: parsed.comments || [],
      config: {
        statuses: parsed.config?.statuses || seed.config.statuses,
        priorities: parsed.config?.priorities || seed.config.priorities,
        types: parsed.config?.types || seed.config.types,
        assignees: parsed.config?.assignees || seed.config.assignees,
      },
    };
  } catch {
    return null;
  }
}

export function TaskProvider({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  });
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const retryRef = useRef(null);

  const syncCall = useCallback((requestFn) => {
    requestFn()
      .then(() => {
        setSyncError(null);
        retryRef.current = null;
      })
      .catch((err) => {
        console.warn("Taskar sync failed", err);
        setSyncError(err.message || "Sync failed");
        retryRef.current = () => syncCall(requestFn);
      });
  }, []);

  const retrySync = useCallback(() => {
    if (retryRef.current) retryRef.current();
  }, []);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  // Load state from the server once signed in; offer a one-time import of
  // this browser's pre-cloud-sync localStorage data if the account is new.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        let server = await fetchState();

        const alreadyOffered = window.localStorage.getItem(IMPORT_OFFERED_KEY);
        const legacy = alreadyOffered ? null : readLegacyLocalState();
        if (!server.hasSynced && legacy && legacy.tasks.length > 0) {
          const wantsImport = window.confirm(
            "Import this device's existing tasks into your account?"
          );
          window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
          if (wantsImport) {
            const res = await fetch("/api/state/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(legacy),
            });
            if (res.ok) {
              server = await fetchState();
            }
          }
        } else if (!alreadyOffered) {
          window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
        }

        if (cancelled) return;
        setState({
          tasks: server.tasks,
          comments: server.comments,
          config: server.config,
        });
      } catch (err) {
        console.warn("Failed to load taskar state from server", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  const addTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    const record = {
      id,
      ticketId: task.ticketId?.trim() || "N/A",
      parentId: task.parentId || null,
      type: task.type || "Task",
      name: task.name?.trim() || "Untitled task",
      status: task.status || "Not Started",
      priority: task.priority || "Normal",
      assignee: task.assignee || "Unassigned",
      startDate: task.startDate || null,
      targetDate: task.targetDate || null,
      progress: Number(task.progress) || 0,
      lastUpdate: todayIso(),
      description: task.description || "",
      githubBranch: task.githubBranch || "N/A",
      jiraLink: task.jiraLink || null,
      commentCount: 0,
      syncSource: task.syncSource || "Manual",
      createdAt: ts,
      updatedAt: ts,
    };
    setState((s) => ({ ...s, tasks: [...s.tasks, record] }));
    syncCall(() =>
      fetch("/api/state/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save task");
      })
    );
    return id;
  }, [syncCall]);

  const updateTask = useCallback((id, patch) => {
    const fullPatch = { ...patch, lastUpdate: todayIso(), updatedAt: nowIso() };
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)),
    }));
    syncCall(() =>
      fetch(`/api/state/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update task");
      })
    );
  }, [syncCall]);

  const deleteTask = useCallback((id) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
    }));
    syncCall(() =>
      fetch(`/api/state/tasks/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete task");
      })
    );
  }, [syncCall]);

  const addComment = useCallback((taskId, { author, text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    const record = {
      id,
      ticketId: taskId,
      parentCommentId,
      created: ts,
      updated: ts,
      author: author || "Me",
      text: text || "",
      jiraIssueLink,
      syncSource,
    };
    setState((s) => ({
      ...s,
      comments: [...s.comments, record],
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, commentCount: (t.commentCount || 0) + 1 } : t
      ),
    }));
    syncCall(() =>
      fetch("/api/state/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save comment");
      })
    );
    return id;
  }, [syncCall]);

  const deleteComment = useCallback((commentId, taskId) => {
    setState((s) => ({
      ...s,
      comments: s.comments.filter((c) => c.id !== commentId),
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, commentCount: Math.max(0, (t.commentCount || 0) - 1) }
          : t
      ),
    }));
    syncCall(() =>
      fetch(`/api/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete comment");
      })
    );
  }, [syncCall]);

  const updateConfig = useCallback((key, values) => {
    setState((s) => ({ ...s, config: { ...s.config, [key]: values } }));
    syncCall(() =>
      fetch("/api/state/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall]);

  // Merge Jira-sourced issues (one-way pull). Matches by ticketId; creates new
  // tasks for issues we haven't seen, updates Jira-owned fields on existing
  // ones, and never touches tasks whose syncSource is "Manual". Reads
  // `state.tasks` directly (not via a setState updater) so the same records
  // used to update local state are the ones sent to the API.
  const mergeJiraIssues = useCallback((issues) => {
    const byTicket = new Map(state.tasks.map((t) => [t.ticketId, t]));
    const toCreate = [];
    const toUpdate = [];
    const ts = nowIso();

    for (const issue of issues) {
      const existing = byTicket.get(issue.ticketId);
      if (existing) {
        toUpdate.push({
          ...existing,
          name: issue.name,
          status: issue.status,
          priority: issue.priority || existing.priority,
          assignee: issue.assignee || existing.assignee,
          targetDate: issue.targetDate ?? existing.targetDate,
          startDate: issue.startDate ?? existing.startDate,
          description: issue.description ?? existing.description,
          jiraLink: issue.jiraLink,
          syncSource: "Jira",
          lastUpdate: todayIso(),
          updatedAt: ts,
        });
      } else {
        toCreate.push({
          id: newId("task"),
          ticketId: issue.ticketId,
          parentId: null,
          type: issue.type || "Task",
          name: issue.name,
          status: issue.status,
          priority: issue.priority || "Normal",
          assignee: issue.assignee || "Unassigned",
          startDate: issue.startDate || null,
          targetDate: issue.targetDate || null,
          progress: 0,
          lastUpdate: todayIso(),
          description: issue.description || "",
          githubBranch: "N/A",
          jiraLink: issue.jiraLink,
          commentCount: 0,
          syncSource: "Jira",
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }

    const updateById = new Map(toUpdate.map((t) => [t.id, t]));
    const nextTasks = [
      ...state.tasks.map((t) => updateById.get(t.id) || t),
      ...toCreate,
    ];
    setState((s) => ({ ...s, tasks: nextTasks }));

    for (const task of toCreate) {
      syncCall(() =>
        fetch("/api/state/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        }).then((res) => {
          if (!res.ok) throw new Error("Failed to save imported task");
        })
      );
    }
    for (const task of toUpdate) {
      syncCall(() =>
        fetch(`/api/state/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        }).then((res) => {
          if (!res.ok) throw new Error("Failed to save imported task");
        })
      );
    }

    return { created: toCreate.length, updated: toUpdate.length };
  }, [state.tasks, syncCall]);

  const resetToSeed = useCallback(() => {
    setState({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall]);

  const value = useMemo(
    () => ({
      tasks: state.tasks,
      comments: state.comments,
      config: state.config,
      hydrated,
      syncError,
      retrySync,
      dismissSyncError,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
    }),
    [
      state,
      hydrated,
      syncError,
      retrySync,
      dismissSyncError,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within a TaskProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify — persistence across reload**

In the Browser pane: sign in, go to Task Table, click "New task", fill in a name, save. Add a comment on it. Go to Configuration, add a new status. Reload the page (`navigate` to the same URL, or `location.reload()` via `javascript_tool`). Expected: the task, its comment, and the new status are all still there (now server-backed, not localStorage).

- [ ] **Step 3: Verify — cross-device sync**

Open a second Browser pane tab (`tabs_create`) in an incognito-equivalent state (or simply sign out and back in with the same account in the same tab, which forces a fresh `GET /api/state`). Expected: the task/comment/config from Step 2 are visible.

- [ ] **Step 4: Verify — first-login import**

In a fresh Browser pane tab with no prior sign-in, before signing in, run (via `javascript_tool`) something that seeds legacy localStorage data, e.g.:
```js
localStorage.setItem('taskar:v1', JSON.stringify({ tasks: [{id:'legacy-1', ticketId:'N/A', type:'Task', name:'Pre-cloud task', status:'Not Started', priority:'Normal', assignee:'Unassigned', progress:0, commentCount:0, syncSource:'Manual', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()}], comments: [], config: null }))
```
Then sign up with a brand-new test email. Expected: a native `confirm()` dialog appears asking to import; accepting it results in "Pre-cloud task" appearing in the Task Table, and reloading keeps it (proves it landed in Postgres, not just local state).

- [ ] **Step 5: Commit**

```bash
git add src/context/TaskContext.js
git commit -m "$(cat <<'EOF'
Swap TaskContext from localStorage to the /api/state backend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: AppShell — sync status, sign-out, and updated copy

**Files:**
- Modify: `src/components/AppShell.js`

**Interfaces:**
- Consumes: `syncError`, `retrySync`, `dismissSyncError` from `useTasks()` (Task 8); `UserButton` from `@clerk/nextjs` (Task 1).

- [ ] **Step 1: Modify `src/components/AppShell.js`**

Three changes to the existing file:

1. Import `UserButton` from `@clerk/nextjs`, and read `syncError`, `retrySync`, `dismissSyncError` from `useTasks()`.
2. Add an early return for the sign-in/sign-up pages so they render without the sidebar chrome:

```js
export default function AppShell({ children }) {
  const pathname = usePathname();
  const { tasks, hydrated, syncError, retrySync, dismissSyncError } = useTasks();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  const openCount = tasks.filter((t) => !DONE_STATUSES.includes(t.status)).length;
  // ...rest unchanged...
```

3. Add a `SyncErrorBanner` component and render it above `{children}`, and add `<UserButton />` next to `Brand`:

```js
function SyncErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      <span>Couldn&apos;t save your last change: {error}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="rounded-md bg-amber-100 px-2 py-1 font-medium hover:bg-amber-200"
        >
          Retry
        </button>
        <button onClick={onDismiss} className="text-amber-500 hover:text-amber-700">
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

Render it as the first child of the `<div className="flex min-h-screen min-w-0 flex-col md:ml-60">` wrapper, before `{children}`:

```js
<div className="flex min-h-screen min-w-0 flex-col md:ml-60">
  <SyncErrorBanner error={syncError} onRetry={retrySync} onDismiss={dismissSyncError} />
  {children}
</div>
```

Add `<UserButton />` inside the desktop sidebar's `<Brand />` row and the mobile drawer's header row (both places `<Brand />` is currently rendered alone) — e.g. wrap in a flex row: `<div className="flex items-center justify-between"><Brand /><UserButton /></div>`.

4. Update the stale footer copy in `OpenCount`:

```js
<p className="mt-3 px-1 text-[11px] leading-snug text-slate-400">
  Your tasks, comments, and Jira connection are saved to your account and
  sync across every device you sign in on.
</p>
```

- [ ] **Step 2: Verify**

Browser pane: visit `/sign-in` directly — no sidebar should render, just the Clerk widget. Sign in, confirm the sidebar shows a `UserButton` avatar and the updated footer text. Force a sync failure (e.g. temporarily stop the dev server mid-request, or in `javascript_tool` monkey-patch `window.fetch` to reject once) and confirm the amber banner appears with working Retry/Dismiss buttons; screenshot for the record.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppShell.js
git commit -m "$(cat <<'EOF'
Show sync errors and account controls in AppShell; update stale storage copy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Jira credentials move to Postgres

**Files:**
- Modify: `src/lib/jiraCredentials.js`
- Modify: `src/app/api/jira/config/route.js`
- Modify: `src/app/api/jira/status/route.js`
- Modify: `src/app/api/jira/test-connection/route.js`
- Modify: `src/app/api/jira/import/route.js`

**Interfaces:**
- Consumes: `getSql` from `@/lib/db`; `encrypt`/`decrypt` from `@/lib/serverCrypto` (unchanged); `auth()`.
- Produces: `getJiraCredentials(userId)`, `getJiraPublicStatus(userId)`, `saveJiraCredentials(userId, input)`, `clearJiraCredentials(userId)` — same names as before, now all taking `userId` as their first argument and reading/writing the `jira_config` table instead of the `taskar_jira` cookie. `src/app/api/jira/sync/route.js` is untouched (it doesn't call any of these — see spec's non-goals).

- [ ] **Step 1: Rewrite `src/lib/jiraCredentials.js`**

```js
// Server-only store for Jira connection settings, one row per Clerk user in
// the jira_config table. Everything (including the API token) stays
// server-side; the token is additionally encrypted before it's stored (see
// serverCrypto.js). Env vars (JIRA_BASE_URL / etc.) remain a fallback for
// anyone who prefers deploy-time config over the UI.

import { getSql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/serverCrypto";

const EMPTY = {
  baseUrl: "",
  email: "",
  project: "",
  jql: "",
  startDateFieldId: "",
  githubBranchFieldId: "",
};

function rowToCreds(row) {
  return {
    baseUrl: row.base_url,
    email: row.email,
    project: row.project,
    jql: row.jql,
    startDateFieldId: row.start_date_field_id,
    githubBranchFieldId: row.github_branch_field_id,
    apiToken: row.api_token_enc ? decrypt(row.api_token_enc) : "",
  };
}

export async function getJiraCredentials(userId) {
  const sql = getSql();
  const [row] = await sql`select * from jira_config where user_id = ${userId}`;
  const fromDb = row ? rowToCreds(row) : null;

  if (fromDb && fromDb.baseUrl && fromDb.email && fromDb.apiToken) {
    return { ...fromDb, source: "ui" };
  }

  const envBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  if (envBaseUrl && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    return {
      baseUrl: envBaseUrl,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      project: process.env.JIRA_PROJECT || "",
      jql: fromDb?.jql || "",
      startDateFieldId: fromDb?.startDateFieldId || "",
      githubBranchFieldId: fromDb?.githubBranchFieldId || "",
      source: "env",
    };
  }

  return { ...EMPTY, apiToken: "", source: "none" };
}

export async function getJiraPublicStatus(userId) {
  const creds = await getJiraCredentials(userId);
  return {
    configured: Boolean(creds.baseUrl && creds.email && creds.apiToken),
    source: creds.source,
    baseUrl: creds.baseUrl || null,
    email: creds.email || null,
    project: creds.project || null,
    jql: creds.jql || null,
    startDateFieldId: creds.startDateFieldId || null,
    githubBranchFieldId: creds.githubBranchFieldId || null,
    hasToken: Boolean(creds.apiToken),
  };
}

export async function saveJiraCredentials(userId, input) {
  const sql = getSql();
  const [existing] = await sql`
    select api_token_enc from jira_config where user_id = ${userId}
  `;
  const tokenEnc = input.apiToken ? encrypt(input.apiToken) : existing?.api_token_enc || null;

  const payload = {
    baseUrl: (input.baseUrl || "").trim().replace(/\/+$/, ""),
    email: (input.email || "").trim(),
    project: (input.project || "").trim(),
    jql: (input.jql || "").trim(),
    startDateFieldId: (input.startDateFieldId || "").trim(),
    githubBranchFieldId: (input.githubBranchFieldId || "").trim(),
  };

  await sql`
    insert into jira_config (
      user_id, base_url, email, project, jql,
      start_date_field_id, github_branch_field_id, api_token_enc
    ) values (
      ${userId}, ${payload.baseUrl}, ${payload.email}, ${payload.project}, ${payload.jql},
      ${payload.startDateFieldId}, ${payload.githubBranchFieldId}, ${tokenEnc}
    )
    on conflict (user_id) do update set
      base_url = excluded.base_url,
      email = excluded.email,
      project = excluded.project,
      jql = excluded.jql,
      start_date_field_id = excluded.start_date_field_id,
      github_branch_field_id = excluded.github_branch_field_id,
      api_token_enc = excluded.api_token_enc
  `;

  return payload;
}

export async function clearJiraCredentials(userId) {
  const sql = getSql();
  await sql`delete from jira_config where user_id = ${userId}`;
}
```

- [ ] **Step 2: Update `src/app/api/jira/config/route.js`**

Add `import { auth } from "@clerk/nextjs/server";` and `const { userId } = await auth();` at the top of `GET`, `POST`, and `DELETE`, then pass `userId` as the first argument to `getJiraPublicStatus`, `saveJiraCredentials`, and `clearJiraCredentials` wherever they're called.

- [ ] **Step 3: Update `src/app/api/jira/status/route.js`**

Add `import { auth } from "@clerk/nextjs/server";`, `const { userId } = await auth();` in `GET`, and pass `userId` to `getJiraPublicStatus(userId)`.

- [ ] **Step 4: Update `src/app/api/jira/test-connection/route.js`**

Add `import { auth } from "@clerk/nextjs/server";`, `const { userId } = await auth();` in `POST`, and pass `userId` to both calls to `getJiraCredentials(userId)`.

- [ ] **Step 5: Update `src/app/api/jira/import/route.js`**

Add `import { auth } from "@clerk/nextjs/server";`, `const { userId } = await auth();` in `POST`, and pass `userId` to `getJiraCredentials(userId)`.

- [ ] **Step 6: Verify**

Browser pane: go to `/jira`, enter a Jira Base URL/email/token (real or dummy — "Test connection" will just report failure for dummy values, that's fine, the point is the save path). Save. Reload the page — the saved values (minus the token) should still show as configured. Sign in as the same user in a second tab/session — Jira Settings shows the same configured connection there too (proves it's no longer per-browser).

- [ ] **Step 7: Commit**

```bash
git add src/lib/jiraCredentials.js src/app/api/jira/config/route.js src/app/api/jira/status/route.js src/app/api/jira/test-connection/route.js src/app/api/jira/import/route.js
git commit -m "$(cat <<'EOF'
Move Jira connection settings from a per-browser cookie to per-account Postgres storage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "About data storage" section (currently lines 164–178)**

Replace it with:

```markdown
## About data storage

Task/comment/configuration data lives in Postgres (Neon, via Vercel
Marketplace), scoped per Clerk account, so it follows you to any device or
browser you sign in on. Jira credentials live in the same database (still
encrypted at rest — see `src/lib/serverCrypto.js`), also per-account. See
[docs/superpowers/specs/2026-08-25-cloud-sync-design.md](docs/superpowers/specs/2026-08-25-cloud-sync-design.md)
for the full design.
```

- [ ] **Step 2: Update the intro paragraph (currently lines 16–22) and the project structure block (currently lines 33–46)**

Replace "Everything — tasks, comments, configuration — lives in your browser (`localStorage`); there's no database yet..." with a sentence reflecting accounts + Postgres instead, and update the `context/` and `lib/` lines in the project-structure block to say "persisted via `/api/state`, backed by Postgres" instead of "persisted to localStorage", and add a line for `src/lib/db.js` and `src/proxy.js`.

- [ ] **Step 3: Verify**

Read the file back and confirm no remaining references to `localStorage` as the source of truth (a reference to the old `taskar:v1` key in the context of "importing a previous device's data" is fine and expected — the import flow still reads it once).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Update README for Postgres-backed, per-account storage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Full end-to-end verification

No files change in this task — it's the spec's Testing checklist run in full, using the Browser pane, to catch anything the per-task checks above didn't (in particular, interaction between features rather than each in isolation).

- [ ] **Step 1: Fresh account, full CRUD, reload**

Sign up with a new test email. Add a task, add a comment on it, edit board config (add a status). Reload the page. Expected: all three persist.

- [ ] **Step 2: Second browser context, same account**

Sign in as the same account in a second Browser pane tab (or after signing out/in). Expected: the task, comment, and config change from Step 1 all appear.

- [ ] **Step 3: Import flow on a pre-existing-data browser**

In a tab with legacy `taskar:v1` localStorage data (seed it via `javascript_tool` as in Task 8 Step 4) and a brand-new account, confirm the import prompt appears, accept it, and confirm the imported tasks/comments match what was in localStorage.

- [ ] **Step 4: No duplicate import for a second new account, same browser**

Immediately after Step 3, sign in with a *second*, different brand-new account on the *same* browser. Expected: no import prompt (the `taskar:import-offered:v1` flag already set), and the new account starts from seed data, not the first account's imported tasks.

- [ ] **Step 5: Jira connection follows the account**

Configure a Jira connection via `/jira`, reload, confirm still configured. Sign in as the same user on a different browser context, confirm the Jira connection is there too.

- [ ] **Step 6: Sign-out redirect**

Use the `UserButton` to sign out. Try to hit `/tasks` directly. Expected: redirected to `/sign-in`.

- [ ] **Step 7: Screenshot for the record**

Take a screenshot of the signed-in Task Table (via `computer {action: "screenshot"}`) as evidence the whole flow works end to end.

No commit for this task (verification only, no code changes) — unless any of the above surfaces a bug, in which case fix it in the relevant task's file, re-verify, and commit the fix with a message describing what was wrong.
