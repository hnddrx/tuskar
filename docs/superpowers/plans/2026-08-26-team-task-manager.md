# Team Task Manager (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, multi-user team task board (tasks + comments) on top of Taskar's existing single-user personal space, using Clerk Organizations for team identity/membership/invites.

**Architecture:** Clerk Organizations provides team creation, invitations, roles, and the active-team context (`orgId`). Three new Postgres tables (`team_tasks`, `team_comments`, `team_board_config`) mirror the shape of the existing personal tables but are scoped by `org_id` instead of `user_id` — kept as fully separate tables (not a shared table with a `team_id` filter) so a query can never leak personal data into a team view or vice versa. `TaskContext` becomes aware of the active Clerk organization: when a team is active it transparently points its fetches and mutations at the new team-scoped API routes instead of the personal ones, so every existing component that calls `useTasks()` (Board, Task Table, Task detail, Comment thread, Auto Docs, Dashboard) works for team boards with no changes.

**Tech Stack:** Next.js App Router, `@clerk/nextjs` (Organizations), `@neondatabase/serverless` (Postgres), React Context. **No test runner is configured in this project** (matches its existing convention — see prior specs' "Testing (manual)" sections) — every task's verification step is a manual check (a database query, a direct browser visit to a route, or a UI walkthrough), not an automated test.

**Spec:** [docs/superpowers/specs/2026-08-26-team-task-manager-design.md](../specs/2026-08-26-team-task-manager-design.md)

## Global Constraints

- Personal tables/routes (`tasks`, `comments`, `board_config`, and their `/api/state/*` routes) are never modified — team data lives in entirely separate tables.
- `assignee` (on team tasks) and `author_user_id` (on team comments) are real Clerk user IDs, and `created_by`/`author_user_id` are always taken from `auth().userId` server-side — never trusted from the request body.
- Every team API route must check `auth().orgId` and return `400 { error: "No active team" }` before touching the database if it's null.
- Clerk Organizations must be enabled in **Membership optional** mode — personal accounts stay available; teams are opt-in.
- Jira import and "Reset to seed" are personal-only; both must be inert/hidden while a team is active.
- `/notes` stays personal-only in this phase regardless of active team (team notes are a separate, later phase).

---

### Task 1: Database migration — team tables

**Files:**
- Modify: `scripts/db-migrate.mjs`

**Interfaces:**
- Produces: tables `team_tasks`, `team_comments`, `team_board_config` with the columns listed below — every later task's SQL depends on these exact column names.

- [ ] **Step 1: Add the three table definitions**

Add this block to `scripts/db-migrate.mjs`, right after the existing `notes` table block (before the closing `console.log` call):

```js
  await sql`
    create table if not exists team_tasks (
      id text primary key,
      org_id text not null,
      ticket_id text not null,
      parent_id text,
      type text not null,
      name text not null,
      status text not null,
      priority text not null,
      assignee text,
      start_date text,
      target_date text,
      progress integer not null default 0,
      last_update text,
      description text not null default '',
      github_branch text not null default 'N/A',
      jira_link text,
      comment_count integer not null default 0,
      sync_source text not null default 'Manual',
      created_by text not null,
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`create index if not exists team_tasks_org_id_idx on team_tasks (org_id)`;

  await sql`
    create table if not exists team_comments (
      id text primary key,
      org_id text not null,
      ticket_id text not null,
      parent_comment_id text,
      created text not null,
      updated text not null,
      author_user_id text not null,
      text text not null default '',
      jira_issue_link text,
      sync_source text not null default 'Manual'
    )
  `;
  await sql`create index if not exists team_comments_org_id_idx on team_comments (org_id)`;
  await sql`create index if not exists team_comments_ticket_id_idx on team_comments (ticket_id)`;

  await sql`
    create table if not exists team_board_config (
      org_id text primary key,
      statuses jsonb not null,
      priorities jsonb not null,
      types jsonb not null
    )
  `;
```

- [ ] **Step 2: Update the completion message**

Change the final `console.log` line to:

```js
  console.log(
    "Migration complete: tasks, comments, board_config, jira_config, notes, team_tasks, team_comments, team_board_config ready."
  );
```

- [ ] **Step 3: Run the migration**

Run: `npm run db:migrate`
Expected: prints the updated completion message with no errors.

- [ ] **Step 4: Verify the tables exist**

Create a throwaway script at `scripts/_verify.mjs`:

```js
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select table_name from information_schema.tables
  where table_name in ('team_tasks', 'team_comments', 'team_board_config')
`;
console.log(rows.map((r) => r.table_name).sort());
```

Run: `npx dotenv -e .env.local -- node scripts/_verify.mjs`
Expected: `[ 'team_board_config', 'team_comments', 'team_tasks' ]`

Delete `scripts/_verify.mjs` afterward — it was only for this check.

- [ ] **Step 5: Commit**

```bash
git add scripts/db-migrate.mjs
git commit -m "Add team_tasks, team_comments, team_board_config tables"
```

---

### Task 2: Enable Clerk Organizations + add the team switcher

**Files:**
- Modify: `src/components/AppShell.js`

**Interfaces:**
- Produces: a visible `<OrganizationSwitcher>` in both the desktop sidebar and mobile drawer, next to `<UserButton />`. Later tasks depend on the user being able to create/switch teams through this UI — there is no other way to set `auth().orgId` in this app.

- [ ] **Step 1: Enable Organizations in Clerk**

This is a one-time dashboard action, not code — do this manually before continuing:

1. Go to `https://dashboard.clerk.com/last-active?path=organizations-settings` (or, if the `clerk` CLI is installed and linked to this project, run `clerk enable orgs` instead).
2. Toggle Organizations **on**.
3. Set **Membership mode** to **"Membership optional"** — NOT "Membership required" (the dashboard default). "Required" mode disables personal accounts entirely, which would break this app's existing personal space.

- [ ] **Step 2: Add the switcher to AppShell**

In `src/components/AppShell.js`, update the import:

```js
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
```

Then add `<OrganizationSwitcher hidePersonal={false} />` next to both existing `<UserButton />` instances — the mobile drawer one (around line 161) and the desktop sidebar one (around line 184):

```js
              <div className="flex items-center justify-between flex-1">
                <Brand />
                <div className="flex items-center gap-2">
                  <OrganizationSwitcher hidePersonal={false} />
                  <UserButton />
                </div>
              </div>
```

and:

```js
        <div className="flex items-center justify-between pr-4">
          <Brand />
          <div className="flex items-center gap-2">
            <OrganizationSwitcher hidePersonal={false} />
            <UserButton />
          </div>
        </div>
```

- [ ] **Step 3: Verify in the browser**

Run `npm run dev`, sign in, and confirm the organization switcher appears in the sidebar. Click it, create a team (any name), and confirm Clerk's own UI shows it as created and active — this is Clerk's built-in behavior, nothing in this app reacts to it yet.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.js
git commit -m "Add Clerk OrganizationSwitcher to AppShell"
```

---

### Task 3: `GET /api/team/members`

**Files:**
- Create: `src/app/api/team/members/route.js`

**Interfaces:**
- Consumes: Clerk's `clerkClient().organizations.getOrganizationMembershipList({ organizationId })`, which returns `{ data: OrganizationMembership[] }` where each item has `.publicUserData.userId`, `.publicUserData.firstName`, `.publicUserData.lastName`, `.publicUserData.identifier` (email).
- Produces: `GET /api/team/members` → `[{ id, name, email }]` for the active team. Task 8 (`TaskContext`) fetches this directly.

- [ ] **Step 1: Write the route**

```js
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }

  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
  });

  const members = data.map((m) => ({
    id: m.publicUserData?.userId,
    name:
      [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") ||
      m.publicUserData?.identifier ||
      "Unknown",
    email: m.publicUserData?.identifier || null,
  }));

  return Response.json(members);
}
```

- [ ] **Step 2: Verify by visiting the route directly**

With a team active (from Task 2), sign in in the browser and navigate directly to `http://localhost:3000/api/team/members`. Same-origin navigation sends the Clerk session cookie automatically, so this is a valid way to exercise an authenticated GET route without extra tooling.
Expected: JSON array with one entry — yourself — e.g. `[{"id":"user_...","name":"Your Name","email":"you@example.com"}]`.

Also confirm the 400 path: switch the active context back to "Personal Account" via the switcher, then reload `/api/team/members`.
Expected: `{"error":"No active team"}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/team/members/route.js
git commit -m "Add GET /api/team/members"
```

---

### Task 4: `GET /api/team/state` + team row mappers

**Files:**
- Modify: `src/lib/db.js`
- Create: `src/app/api/team/state/route.js`

**Interfaces:**
- Produces (`db.js`):
  - `rowToTeamTask(row, membersById = {})` → `{ id, ticketId, parentId, type, name, status, priority, assignee, assigneeId, startDate, targetDate, progress, lastUpdate, description, githubBranch, jiraLink, commentCount, syncSource, createdBy, createdAt, updatedAt }`. `assignee` is a **display name** resolved via `membersById[row.assignee]` (or `"Unassigned"`); `assigneeId` is always the raw Clerk user ID from `row.assignee` (or `null`). Every later task that reads or writes a team task's assignee must use `assigneeId` for storage and `assignee` only for display — never write `assignee` back to the DB.
  - `rowToTeamComment(row, membersById = {})` → `{ id, ticketId, parentCommentId, created, updated, author, authorUserId, text, jiraIssueLink, syncSource }`. Same pattern: `author` is a resolved display name, `authorUserId` is the raw Clerk ID.
  - `getTeamMembersById(orgId)` → `Promise<Record<string, string>>`, a map of Clerk user ID → display name, used to build the `membersById` argument above.
- Produces (route): `GET /api/team/state` → `{ tasks, comments, config, hasSynced }`, the team equivalent of `GET /api/state`.

- [ ] **Step 1: Add the mappers and helper to `db.js`**

Add this import at the top of `src/lib/db.js`:

```js
import { clerkClient } from "@clerk/nextjs/server";
```

Add these functions (after the existing `rowToComment`):

```js
export async function getTeamMembersById(orgId) {
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
  });
  const map = {};
  for (const m of data) {
    if (!m.publicUserData?.userId) continue;
    map[m.publicUserData.userId] =
      [m.publicUserData.firstName, m.publicUserData.lastName].filter(Boolean).join(" ") ||
      m.publicUserData.identifier ||
      "Unknown";
  }
  return map;
}

export function rowToTeamTask(row, membersById = {}) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee ? membersById[row.assignee] || "Unknown" : "Unassigned",
    assigneeId: row.assignee,
    startDate: row.start_date,
    targetDate: row.target_date,
    progress: row.progress,
    lastUpdate: row.last_update,
    description: row.description,
    githubBranch: row.github_branch,
    jiraLink: row.jira_link,
    commentCount: row.comment_count,
    syncSource: row.sync_source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToTeamComment(row, membersById = {}) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    parentCommentId: row.parent_comment_id,
    created: row.created,
    updated: row.updated,
    author: membersById[row.author_user_id] || "Unknown",
    authorUserId: row.author_user_id,
    text: row.text,
    jiraIssueLink: row.jira_issue_link,
    syncSource: row.sync_source,
  };
}
```

- [ ] **Step 2: Write the state route**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, rowToTeamComment, getTeamMembersById } from "@/lib/db";
import seed from "@/data/seed.json";

const DEFAULT_TEAM_CONFIG = {
  statuses: seed.config.statuses,
  priorities: seed.config.priorities,
  types: seed.config.types,
};

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  const membersById = await getTeamMembersById(orgId);

  const [configRow] = await sql`
    select * from team_board_config where org_id = ${orgId}
  `;
  const taskRows = await sql`
    select * from team_tasks where org_id = ${orgId} order by created_at asc
  `;
  const commentRows = await sql`
    select * from team_comments where org_id = ${orgId} order by created asc
  `;

  return Response.json({
    tasks: taskRows.map((r) => rowToTeamTask(r, membersById)),
    comments: commentRows.map((r) => rowToTeamComment(r, membersById)),
    config: configRow
      ? {
          statuses: configRow.statuses,
          priorities: configRow.priorities,
          types: configRow.types,
        }
      : DEFAULT_TEAM_CONFIG,
    hasSynced: Boolean(configRow),
  });
}
```

- [ ] **Step 3: Verify by visiting the route directly**

With a team active, navigate to `http://localhost:3000/api/team/state`.
Expected: `{"tasks":[],"comments":[],"config":{"statuses":[...],"priorities":[...],"types":[...]},"hasSynced":false}` — empty arrays (no tasks yet), default config, `hasSynced: false` since no `team_board_config` row exists yet.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js "src/app/api/team/state/route.js"
git commit -m "Add GET /api/team/state and team row mappers"
```

---

### Task 5: Team task mutation routes

**Files:**
- Create: `src/app/api/team/state/tasks/route.js`
- Create: `src/app/api/team/state/tasks/[id]/route.js`

**Interfaces:**
- Consumes: `rowToTeamTask`, `getTeamMembersById` from `src/lib/db.js` (Task 4).
- Produces: `POST /api/team/state/tasks` and `PATCH`/`DELETE /api/team/state/tasks/:id`, mirroring `/api/state/tasks[/:id]`. The request body's `assigneeId` field (a raw Clerk user ID or `null`) is what gets written to the `assignee` column — the body's `assignee` field (a display name) is always ignored for storage.

- [ ] **Step 1: Write the POST route**

`src/app/api/team/state/tasks/route.js`:

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById } from "@/lib/db";

export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const task = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into team_tasks (
      id, org_id, ticket_id, parent_id, type, name, status, priority, assignee,
      start_date, target_date, progress, last_update, description, github_branch,
      jira_link, comment_count, sync_source, created_by, created_at, updated_at
    ) values (
      ${task.id}, ${orgId}, ${task.ticketId}, ${task.parentId || null}, ${task.type},
      ${task.name}, ${task.status}, ${task.priority}, ${task.assigneeId ?? null},
      ${task.startDate || null}, ${task.targetDate || null}, ${task.progress || 0},
      ${task.lastUpdate || null}, ${task.description || ""}, ${task.githubBranch || "N/A"},
      ${task.jiraLink || null}, ${task.commentCount || 0}, ${task.syncSource || "Manual"},
      ${userId}, ${task.createdAt}, ${task.updatedAt}
    )
    returning *
  `;

  const membersById = await getTeamMembersById(orgId);
  return Response.json(rowToTeamTask(row, membersById), { status: 201 });
}
```

- [ ] **Step 2: Write the PATCH/DELETE route**

`src/app/api/team/state/tasks/[id]/route.js`:

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from team_tasks where id = ${id} and org_id = ${orgId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const membersById = await getTeamMembersById(orgId);
  const merged = { ...rowToTeamTask(existing, membersById), ...patch };

  const [row] = await sql`
    update team_tasks set
      ticket_id = ${merged.ticketId},
      parent_id = ${merged.parentId || null},
      type = ${merged.type},
      name = ${merged.name},
      status = ${merged.status},
      priority = ${merged.priority},
      assignee = ${merged.assigneeId ?? null},
      start_date = ${merged.startDate || null},
      target_date = ${merged.targetDate || null},
      progress = ${merged.progress || 0},
      last_update = ${merged.lastUpdate || null},
      description = ${merged.description || ""},
      github_branch = ${merged.githubBranch || "N/A"},
      jira_link = ${merged.jiraLink || null},
      comment_count = ${merged.commentCount || 0},
      sync_source = ${merged.syncSource || "Manual"},
      updated_at = ${merged.updatedAt}
    where id = ${id} and org_id = ${orgId}
    returning *
  `;

  return Response.json(rowToTeamTask(row, membersById));
}

export async function DELETE(_request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  await sql`delete from team_tasks where id = ${id} and org_id = ${orgId}`;
  return Response.json({ ok: true });
}
```

Note on `merged.assigneeId ?? null` in the PATCH route: `rowToTeamTask(existing, ...)` always populates `assigneeId` from the existing row, so if `patch` doesn't touch assignee at all, `merged.assigneeId` correctly falls back to the task's current assignee — a patch that only changes, say, `status` can never accidentally blank out or corrupt the assignee.

- [ ] **Step 3: Verify**

This task has no UI yet, so verification is deferred to Task 8, where `TaskContext` wires these routes to `addTask`/`updateTask`/`deleteTask` and they become exercisable through the normal Task Table / Board UI. Confirm the files compile with no errors: run `npx eslint src/app/api/team/state/tasks/route.js "src/app/api/team/state/tasks/[id]/route.js"` and expect no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/team/state/tasks/route.js" "src/app/api/team/state/tasks/[id]/route.js"
git commit -m "Add team task mutation routes"
```

---

### Task 6: Team comment mutation routes

**Files:**
- Create: `src/app/api/team/state/comments/route.js`
- Create: `src/app/api/team/state/comments/[id]/route.js`

**Interfaces:**
- Consumes: `rowToTeamComment`, `getTeamMembersById` from `src/lib/db.js` (Task 4).
- Produces: `POST /api/team/state/comments` and `DELETE /api/team/state/comments/:id?taskId=...`, mirroring `/api/state/comments[/:id]`. `author_user_id` always comes from `auth().userId`, never from the request body.

- [ ] **Step 1: Write the POST route**

`src/app/api/team/state/comments/route.js`:

```js
import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamComment, getTeamMembersById } from "@/lib/db";

export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const comment = await request.json();
  const sql = getSql();

  const results = await sql.transaction([
    sql`
      insert into team_comments (
        id, org_id, ticket_id, parent_comment_id, created, updated,
        author_user_id, text, jira_issue_link, sync_source
      ) values (
        ${comment.id}, ${orgId}, ${comment.ticketId}, ${comment.parentCommentId || null},
        ${comment.created}, ${comment.updated}, ${userId}, ${comment.text || ""},
        ${comment.jiraIssueLink || null}, ${comment.syncSource || "Manual"}
      )
      returning *
    `,
    sql`
      update team_tasks set comment_count = comment_count + 1
      where id = ${comment.ticketId} and org_id = ${orgId}
    `,
  ]);

  const row = results[0][0];
  const membersById = await getTeamMembersById(orgId);
  return Response.json(rowToTeamComment(row, membersById), { status: 201 });
}
```

- [ ] **Step 2: Write the DELETE route**

`src/app/api/team/state/comments/[id]/route.js`:

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  await sql.transaction([
    sql`delete from team_comments where id = ${id} and org_id = ${orgId}`,
    sql`
      update team_tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and org_id = ${orgId}
    `,
  ]);

  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

Same as Task 5 — no UI yet. Run `npx eslint "src/app/api/team/state/comments/route.js" "src/app/api/team/state/comments/[id]/route.js"` and expect no output. Full exercise happens once Task 8 wires `addComment`/`deleteComment`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/team/state/comments/route.js" "src/app/api/team/state/comments/[id]/route.js"
git commit -m "Add team comment mutation routes"
```

---

### Task 7: Team config route

**Files:**
- Create: `src/app/api/team/state/config/route.js`

**Interfaces:**
- Produces: `PUT /api/team/state/config`, mirroring `/api/state/config` but for `statuses`/`priorities`/`types` only — no `assignees` key (team assignees come from Clerk membership, see Task 3).

- [ ] **Step 1: Write the route**

```js
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const ALLOWED_KEYS = ["statuses", "priorities", "types"];

export async function PUT(request) {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const { key, values } = await request.json();
  const sql = getSql();

  if (!ALLOWED_KEYS.includes(key)) {
    return Response.json({ error: "Invalid config key" }, { status: 400 });
  }

  const [existing] = await sql`
    select * from team_board_config where org_id = ${orgId}
  `;
  const base = existing
    ? { statuses: existing.statuses, priorities: existing.priorities, types: existing.types }
    : { statuses: [], priorities: [], types: [] };
  const merged = { ...base, [key]: values };

  await sql`
    insert into team_board_config (org_id, statuses, priorities, types)
    values (
      ${orgId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb, ${JSON.stringify(merged.types)}::jsonb
    )
    on conflict (org_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types
  `;

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify**

No UI yet — run `npx eslint "src/app/api/team/state/config/route.js"` and expect no output. Full exercise happens once Task 8 wires `updateConfig` and Task 11 confirms the Config page's assignee editor is hidden for teams.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/team/state/config/route.js"
git commit -m "Add PUT /api/team/state/config"
```

---

### Task 8: `TaskContext` becomes org-aware

**Files:**
- Modify: `src/context/TaskContext.js`

**Interfaces:**
- Consumes: all routes from Tasks 3–7; `useAuth()`'s `orgId`; `useUser()` from `@clerk/nextjs`.
- Produces: `useTasks()` gains two new fields, `orgId` and `members` (array of `{id, name, email}`, empty when personal). Every existing consumer of `useTasks()` (9 components/pages) needs zero changes — this is the task that makes that true.

This task replaces the entire file. The behavior for personal mode (`orgId` falsy) is unchanged from today; every diff below is either new team-mode branching or a dependency-array addition.

- [ ] **Step 1: Replace the whole file**

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
import { useAuth, useUser } from "@clerk/nextjs";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";
import { useConfirm } from "@/components/ConfirmProvider";

const TaskContext = createContext(null);
const IMPORT_OFFERED_KEY = "taskar:import-offered:v1";

async function fetchState(orgId) {
  const res = await fetch(orgId ? "/api/team/state" : "/api/state");
  if (!res.ok) throw new Error(`Failed to load state (${res.status})`);
  return res.json();
}

async function fetchMembers() {
  const res = await fetch("/api/team/members");
  if (!res.ok) return [];
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
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const { user } = useUser();
  const confirm = useConfirm();
  const [state, setState] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  });
  const [members, setMembers] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const failedRequestRef = useRef(null);
  const lastUserIdRef = useRef(undefined);
  const lastOrgIdRef = useRef(undefined);

  const syncCall = useCallback((requestFn) => {
    requestFn()
      .then(() => {
        setSyncError(null);
        failedRequestRef.current = null;
      })
      .catch((err) => {
        console.warn("Taskar sync failed", err);
        setSyncError(err.message || "Sync failed");
        failedRequestRef.current = requestFn;
      });
  }, []);

  const retrySync = useCallback(() => {
    if (failedRequestRef.current) syncCall(failedRequestRef.current);
  }, [syncCall]);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  // Load state from the server once signed in. Re-runs, resetting local
  // state first, whenever the signed-in user OR the active Clerk
  // organization changes (Clerk's account switcher and OrganizationSwitcher
  // can both change context without a full page reload) — so a previous
  // account's or team's data never lingers on screen. The one-time legacy
  // localStorage import only applies to the personal space.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const identityChanged =
      (lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId) ||
      (lastOrgIdRef.current !== undefined && lastOrgIdRef.current !== orgId);
    if (identityChanged) {
      setHydrated(false);
      setState({ tasks: [], comments: [], config: seed.config });
      setMembers([]);
    }
    lastUserIdRef.current = userId;
    lastOrgIdRef.current = orgId;

    (async () => {
      try {
        let server = await fetchState(orgId);

        if (!orgId) {
          const alreadyOffered = window.localStorage.getItem(IMPORT_OFFERED_KEY);
          const legacy = alreadyOffered ? null : readLegacyLocalState();
          if (!server.hasSynced && legacy && legacy.tasks.length > 0) {
            const wantsImport = await confirm({
              title: "Import existing tasks?",
              message:
                "This device has tasks saved locally from before cloud sync. Import them into your account now?",
              confirmLabel: "Import",
              cancelLabel: "Skip",
            });
            window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
            if (wantsImport) {
              const res = await fetch("/api/state/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(legacy),
              });
              if (res.ok) {
                server = await fetchState(orgId);
              }
            }
          } else if (!alreadyOffered) {
            window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
          }
        }

        const memberList = orgId ? await fetchMembers() : [];

        if (cancelled) return;
        setState({
          tasks: server.tasks,
          comments: server.comments,
          // Team config has no `assignees` key server-side (team assignees
          // come from Clerk membership, not a hand-typed list — see Task 3).
          // Synthesizing it here as the members' display names means every
          // existing consumer that reads `config.assignees` (TaskFiltersPanel,
          // the task detail page) keeps working unchanged: they filter/display
          // by name, and `task.assignee` for a team task is already a
          // resolved display name (see `rowToTeamTask`, Task 4).
          config: orgId
            ? { ...server.config, assignees: memberList.map((m) => m.name) }
            : server.config,
        });
        setMembers(memberList);
      } catch (err) {
        console.warn("Failed to load taskar state from server", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, orgId, confirm]);

  const addTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    const resolved = orgId
      ? {
          assignee: members.find((m) => m.id === task.assignee)?.name || "Unassigned",
          assigneeId: task.assignee || null,
        }
      : { assignee: task.assignee || "Unassigned", assigneeId: null };
    const record = {
      id,
      ticketId: task.ticketId?.trim() || "N/A",
      parentId: task.parentId || null,
      type: task.type || "Task",
      name: task.name?.trim() || "Untitled task",
      status: task.status || "Not Started",
      priority: task.priority || "Normal",
      ...resolved,
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
    const base = orgId ? "/api/team/state/tasks" : "/api/state/tasks";
    syncCall(() =>
      fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save task");
      })
    );
    return id;
  }, [syncCall, orgId, members]);

  const updateTask = useCallback((id, patch) => {
    const resolvedPatch = { ...patch };
    if (orgId && "assignee" in patch) {
      resolvedPatch.assigneeId = patch.assignee || null;
      resolvedPatch.assignee =
        members.find((m) => m.id === patch.assignee)?.name || "Unassigned";
    }
    const fullPatch = { ...resolvedPatch, lastUpdate: todayIso(), updatedAt: nowIso() };
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)),
    }));
    const base = orgId ? `/api/team/state/tasks/${id}` : `/api/state/tasks/${id}`;
    syncCall(() =>
      fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update task");
      })
    );
  }, [syncCall, orgId, members]);

  const deleteTask = useCallback((id) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
    }));
    const base = orgId ? `/api/team/state/tasks/${id}` : `/api/state/tasks/${id}`;
    syncCall(() =>
      fetch(base, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete task");
      })
    );
  }, [syncCall, orgId]);

  const addComment = useCallback((taskId, { author, text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    const record = {
      id,
      ticketId: taskId,
      parentCommentId,
      created: ts,
      updated: ts,
      author: orgId
        ? user?.fullName || user?.primaryEmailAddress?.emailAddress || "You"
        : author || "Me",
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
    const base = orgId ? "/api/team/state/comments" : "/api/state/comments";
    syncCall(() =>
      fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save comment");
      })
    );
    return id;
  }, [syncCall, orgId, user]);

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
    const base = orgId
      ? `/api/team/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`
      : `/api/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`;
    syncCall(() =>
      fetch(base, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete comment");
      })
    );
  }, [syncCall, orgId]);

  const updateConfig = useCallback((key, values) => {
    setState((s) => ({ ...s, config: { ...s.config, [key]: values } }));
    const base = orgId ? "/api/team/state/config" : "/api/state/config";
    syncCall(() =>
      fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall, orgId]);

  // Merge Jira-sourced issues (one-way pull). Matches by ticketId; creates new
  // tasks for issues we haven't seen, updates Jira-owned fields on existing
  // ones, and never touches tasks whose syncSource is "Manual". Reads
  // `state.tasks` directly (not via a setState updater) so the same records
  // used to update local state are the ones sent to the API. Personal-only —
  // Jira import into a team board is out of scope for this phase.
  const mergeJiraIssues = useCallback((issues) => {
    if (orgId) return { created: 0, updated: 0 };
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
  }, [state.tasks, syncCall, orgId]);

  // Demo-data reset. Personal-only — a team board has no seed content.
  const resetToSeed = useCallback(() => {
    if (orgId) return;
    setState({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall, orgId]);

  const value = useMemo(
    () => ({
      tasks: state.tasks,
      comments: state.comments,
      config: state.config,
      orgId,
      members,
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
      orgId,
      members,
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

- [ ] **Step 2: Verify — lint and build**

Run: `npx eslint src/context/TaskContext.js`
Expected: no output.

Run: `npx next build`
Expected: compiles successfully (this also exercises every one of the 9 components that call `useTasks()`, since the build type-checks/bundles them all).

- [ ] **Step 3: Verify — end-to-end in the browser**

1. Sign in, stay on "Personal Account". Confirm the Board and Task Table still show your existing personal tasks exactly as before (no regression).
2. Switch to a team via the switcher. Confirm the Board and Task Table immediately go empty (not a flash of your personal tasks) — this is the reset-on-`orgId`-change behavior.
3. Add a task while the team is active (assignee picker isn't team-aware yet — that's Task 9, so just leave it unassigned). Confirm it appears on the team board.
4. Switch back to Personal. Confirm your personal tasks reappear and the team task from step 3 is gone from view.
5. Switch back to the team. Confirm the task from step 3 is still there (it round-tripped through Postgres, not just local state).

- [ ] **Step 4: Commit**

```bash
git add src/context/TaskContext.js
git commit -m "Make TaskContext aware of the active Clerk organization"
```

---

### Task 9: Team-aware assignee picker in `TaskFormModal` and the task detail page

**Files:**
- Modify: `src/components/TaskFormModal.js`
- Modify: `src/components/InlineField.js`
- Modify: `src/app/tasks/[id]/page.js`

**Interfaces:**
- Consumes: `orgId`, `members` from `useTasks()` (Task 8).
- Note: `TaskFiltersPanel.js` and every other reader of `config.assignees` need **no changes** — Task 8 already synthesizes `config.assignees` as the team's member display names, so filtering/display-only consumers keep working as-is. Only the two places that *edit* assignee (this task's two components) need to be ID-aware, because `TaskContext.updateTask` (Task 8) expects a member ID for team tasks, not a display name.

- [ ] **Step 1: Read `orgId` and `members`, and use the right options list**

In `src/components/TaskFormModal.js`, change:

```js
  const { config, addTask, updateTask, tasks } = useTasks();
```

to:

```js
  const { config, addTask, updateTask, tasks, orgId, members } = useTasks();
```

- [ ] **Step 2: Pre-fill the form with the raw member ID in team mode**

The form's initial-state effect currently does `assignee: task.assignee`. Since `task.assignee` is now a **display name** (resolved by `rowToTeamTask`) for team tasks, editing must pre-select using `task.assigneeId` (the raw ID) instead. Change:

```js
              assignee: task.assignee,
```

to:

```js
              assignee: orgId ? task.assigneeId || "" : task.assignee,
```

- [ ] **Step 3: Swap the assignee `<select>`'s options**

Change the Assignee field (the `<select>` with `<option value="">Unassigned</option>` followed by `config.assignees.map(...)`) to branch on `orgId`:

```js
              <select
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              >
                <option value="">Unassigned</option>
                {orgId
                  ? members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))
                  : config.assignees.map((a) => <option key={a}>{a}</option>)}
              </select>
```

`form.assignee` now holds a Clerk user ID when `orgId` is set (matching what `TaskContext.addTask`/`updateTask` expect in Task 8 — they look up `members.find((m) => m.id === task.assignee)`), and a free-text name otherwise, unchanged from today.

- [ ] **Step 4: Extend `InlineField` to support `{label, value}` options**

The task detail page's assignee field is edited inline (click-to-edit, not a modal) via `InlineField`. Today its `type === "select"` branch only supports flat string options where the displayed label and the committed value are the same string — fine for Status/Priority, but wrong for a team assignee, which needs to *display* a name while *committing* a Clerk user ID. In `src/components/InlineField.js`, change the `type === "select"` branch's `options.map`:

```js
          {options.map((o) => {
            const opt = typeof o === "object" && o !== null ? o : { label: o, value: o };
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
```

Every other caller of `InlineField` passes plain strings (e.g. `options={config.statuses}`), so `typeof o === "object"` is `false` for them and they fall into the `{ label: o, value: o }` branch — identical behavior to before. No other file needs to change for this step.

- [ ] **Step 5: Make the task detail page's assignee field team-aware**

In `src/app/tasks/[id]/page.js`, change:

```js
  const { tasks, comments, config, updateTask } = useTasks();
```

to:

```js
  const { tasks, comments, config, updateTask, orgId, members } = useTasks();
```

Then the assignee `<InlineField>` (around line 230) currently reads:

```js
                    <InlineField
                      type="select"
                      value={effective("assignee") || "Unassigned"}
                      options={["Unassigned", ...config.assignees]}
                      onCommit={(v) => patchPending("assignee", v)}
                    />
```

`config`, `orgId`, and `members` all come from `useTasks()`, already destructured near the top of this file (confirm `orgId` and `members` are added to that existing destructure alongside `tasks`, `comments`, `config`, `updateTask`). Change the assignee field to:

```js
                    <InlineField
                      type="select"
                      value={
                        orgId
                          ? ("assignee" in pendingChanges ? pendingChanges.assignee : task.assigneeId) || ""
                          : effective("assignee") || "Unassigned"
                      }
                      options={
                        orgId
                          ? [{ label: "Unassigned", value: "" }, ...members.map((m) => ({ label: m.name, value: m.id }))]
                          : ["Unassigned", ...config.assignees]
                      }
                      onCommit={(v) => patchPending("assignee", v)}
                    />
```

`patchPending("assignee", v)` is unchanged — when `orgId` is set, `v` is now a member ID (or `""`), which flows into `updateTask`'s patch exactly the way Task 8's `updateTask` expects (`"assignee" in patch` → resolves `assigneeId`/`assignee` from `members`).

The `value` prop can't reuse `effective("assignee")` here in team mode: `patchPending` always stores under the key `"assignee"`, but `task.assignee` is a **display name** while a pending edit's value is a **raw member ID** — mixing the two would show the wrong thing depending on whether there's a pending edit. Reading `task.assigneeId` for the "no pending edit yet" case and the raw pending value otherwise keeps the dropdown always showing an ID that matches one of its own `options` values.

One accepted quirk from this: `patchPending`'s dirty-check (`value === task[field]`) compares the new raw ID against `task.assignee` (a name), so re-selecting the *same* person in team mode won't clear the pending-change/dirty state the way it does for every other field. Cosmetic only (an unnecessary but harmless enabled Save/Discard), not a data-correctness issue — not worth special-casing the shared `patchPending` helper for.

- [ ] **Step 6: Verify in the browser**

With a team active, open "New task", confirm the Assignee dropdown lists your team's real members (not the old personal `config.assignees` roster). Assign the task to yourself, save, and confirm the Board/Task Table show your actual name as the assignee (not a raw `user_...` ID). Edit the task again and confirm the dropdown re-opens with you correctly pre-selected.

Then open that task's detail page (`/tasks/:id`) and confirm the inline Assignee field shows the same real name, and that clicking it opens a dropdown of real member names (not raw IDs) with you selected. Change it to "Unassigned" via the inline field, confirm the Board reflects that immediately, then re-assign it to yourself via the inline field this time (not the modal) and confirm that round-trips correctly after a reload.

Switch to Personal, open "New task" there and a personal task's detail page, and confirm both Assignee fields are unchanged from before this task (your personal `config.assignees` list, still committing plain name strings).

- [ ] **Step 7: Commit**

```bash
git add src/components/TaskFormModal.js src/components/InlineField.js "src/app/tasks/[id]/page.js"
git commit -m "Make the assignee picker team-aware (real members vs personal roster)"
```

---

### Task 10: Hide the free-text author field for team comments

**Files:**
- Modify: `src/components/CommentThread.js`

**Interfaces:**
- Consumes: `orgId` from `useTasks()` (Task 8).

Team comment authorship is always the signed-in user (enforced server-side in Task 6 — `author_user_id` comes from `auth()`, never the request body), so letting someone type an arbitrary "author" name in team mode would be misleading UI, not a real capability.

- [ ] **Step 1: Read `orgId` and hide the author input in team mode**

Change:

```js
  const { comments, addComment, deleteComment } = useTasks();
```

to:

```js
  const { comments, addComment, deleteComment, orgId } = useTasks();
```

Then wrap the author `<input>` so it only renders in personal mode:

```js
        <div className="flex items-center justify-between">
          {!orgId && (
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:text-slate-400 dark:focus:border-slate-500 transition-colors"
            />
          )}
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition-colors"
          >
            <Send size={13} /> Add update
          </button>
        </div>
```

(`handleSubmit` still passes `author` from local state to `addComment` — that's fine, `TaskContext.addComment` (Task 8) already ignores the client-supplied `author` and substitutes the real signed-in user's name whenever `orgId` is set, so this stale local `author` value is simply unused in team mode.)

- [ ] **Step 2: Verify in the browser**

With a team active, open a team task's detail page, confirm the comment form has no author text field, and post a comment — confirm it shows your real name (from Clerk), not "Wren" or anything typed. Switch to Personal and confirm the author field is back and behaves exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/components/CommentThread.js
git commit -m "Hide the free-text author field for team comments"
```

---

### Task 11: Hide Jira import, Reset-to-seed, and the personal assignee-roster editor in team context

**Files:**
- Modify: `src/app/jira/page.js`
- Modify: `src/app/config/page.js`

**Interfaces:**
- Consumes: `orgId` from `useAuth()` (jira page, which already imports it — see the account-leak fix earlier in this project's history) and from `useTasks()` (config page).

- [ ] **Step 1: Guard the Jira page**

`src/app/jira/page.js` already imports `useAuth` from `@clerk/nextjs` and destructures `userId` from it (added when this page was made to refetch on account switch). Change:

```js
  const { userId } = useAuth();
```

to:

```js
  const { userId, orgId } = useAuth();
```

Then, right before the final `return (...)` of the component, add:

```js
  if (orgId) {
    return (
      <div className="flex-1">
        <PageHeader
          title="Jira Import"
          subtitle="Jira import is only available in your personal space."
        />
        <div className="px-4 py-6 sm:px-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Switch to your Personal Account to configure or run a Jira import.
          </p>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Guard the Config page**

In `src/app/config/page.js`, change:

```js
  const { config, updateConfig, resetToSeed } = useTasks();
```

to:

```js
  const { config, updateConfig, resetToSeed, orgId } = useTasks();
```

Hide the "Reset to imported data" button and the "Assignees" editor when a team is active:

```js
        actions={
          !orgId && (
            <button
              onClick={handleReset}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Reset to imported data
            </button>
          )
        }
```

and:

```js
          {!orgId && (
            <ConfigListEditor
              title="Assignees"
              items={config.assignees}
              onChange={(v) => updateConfig("assignees", v)}
            />
          )}
```

(leave `Statuses`, `Priorities`, and `Task types` unguarded — those config keys are valid for both personal and team, per `ALLOWED_KEYS` in the Task 7 route.)

- [ ] **Step 3: Verify in the browser**

With a team active: visit `/jira` and confirm it shows the "personal space only" message instead of the connection form; visit `/config` and confirm there's no "Reset to imported data" button and no "Assignees" card, but Statuses/Priorities/Task types are still there and editable (confirm editing one actually persists — reload and check it stuck).

Switch to Personal: confirm `/jira` and `/config` look exactly as they did before this task.

- [ ] **Step 4: Commit**

```bash
git add src/app/jira/page.js src/app/config/page.js
git commit -m "Hide Jira import, seed reset, and assignee roster editor in team context"
```

---

## Self-Review Notes

- **Spec coverage:** Clerk Organizations setup (Task 2), separate team tables (Task 1), team membership as the assignee source (Tasks 3, 9), parallel API routes scoped by `orgId` (Tasks 4–7), context-aware `TaskContext` reusing all existing UI (Task 8), Jira/reset-to-seed/`config.assignees` editor hidden in team context (Task 11), server-derived `created_by`/`author_user_id` (Tasks 5–6). `/notes` is intentionally untouched by this plan, matching the spec's Phase 1 boundary.
- **Assignee id/name duality:** traced through create → read → edit → patch across Tasks 4, 5, 8, 9 to confirm `assigneeId` (never `assignee`) is always what gets written to the `assignee` column, and a patch that doesn't touch assignee can't corrupt it (Task 5's `merged.assigneeId ?? null`).
- **Found and fixed during review — `config.assignees` crash risk:** every reader of `config.assignees` was grepped (`TaskFiltersPanel.js`, `TaskFormModal.js`, `config/page.js`, and `tasks/[id]/page.js`, which does `[...config.assignees]` — a guaranteed `TypeError` on `undefined`). Team config has no `assignees` column (Task 1/7), so without a fix every one of those would break the first time someone opened a team board. Fixed by having Task 8 synthesize `config.assignees` as the team's member names when `orgId` is active — `TaskFiltersPanel` and the read-only paths need zero changes as a result. The two *editing* surfaces (`TaskFormModal`, the task detail page's inline field) still needed to become ID-aware, since `updateTask` needs a member ID, not a name — handled in Task 9, which also required a small backward-compatible extension to `InlineField` (`{label, value}` options) since it previously only supported flat strings.
- **Type/name consistency:** `rowToTeamTask`/`rowToTeamComment`/`getTeamMembersById` (defined in Task 4) are used with identical signatures in Tasks 5, 6, 8 — checked call sites match.
