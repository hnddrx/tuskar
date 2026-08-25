# Cloud sync across devices (Clerk + Neon Postgres)

Status: approved design, pending implementation plan
Date: 2026-08-25

## Problem

Taskar persists everything in the browser only:

- `src/context/TaskContext.js` loads/saves `{ tasks, comments, config }` to
  `window.localStorage` under `STORAGE_KEY` (`"taskar:v1"`). Nothing is ever
  sent to a server.
- `src/lib/jiraCredentials.js` stores the Jira connection (base URL, email,
  encrypted API token, project, JQL, field mappings) in an `HttpOnly` cookie
  (`taskar_jira`) — server-side, but still scoped to one browser.

Opening Taskar in a different browser or device therefore starts from
`src/data/seed.json` with none of the user's real tasks, comments, config
changes, or Jira connection. This spec adds real user accounts and a cloud
database so all of that follows the user everywhere.

## Non-goals

- No sharing / multi-tenant features. Each account only ever sees its own
  data — no team boards, no collaborators.
- No realtime sync, offline queueing, or conflict resolution beyond
  last-write-wins on `updated_at`. This is a personal tool used on a small
  number of devices, not a concurrent multi-editor app.
- No change to the Jira *sync logic* itself (`src/lib/jira.js`,
  `mergeJiraIssues`) — only where the Jira connection settings are stored.
- No change to `TaskContext`'s public API (`addTask`, `updateTask`,
  `deleteTask`, `addComment`, `deleteComment`, `updateConfig`,
  `mergeJiraIssues`, `resetToSeed`) — components keep using it unchanged.

## Design

### 1. Auth: Clerk

Installed via Vercel Marketplace (`vercel integration add clerk`), which
auto-provisions `CLERK_SECRET_KEY` and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Sign-in supports email/password and
"Continue with Google" (Clerk's default hosted components, no custom UI
needed).

- `src/app/layout.js` wraps the app in `<ClerkProvider>`.
- New `middleware.js` (via `clerkMiddleware`) requires a signed-in session
  for every route except `/sign-in`, `/sign-up`, and static assets —
  including `/api/*`, so API routes never need to duplicate the auth check
  for *whether* someone is signed in (they still read `userId` to scope
  queries).
- New `src/app/sign-in/[[...sign-in]]/page.js` and
  `src/app/sign-up/[[...sign-up]]/page.js` rendering Clerk's `<SignIn />`
  / `<SignUp />`.

### 2. Database: Neon Postgres

Installed via Vercel Marketplace (`vercel integration add neon`), which
provisions `DATABASE_URL`. Accessed with `@neondatabase/serverless`
directly (tagged-template SQL) — no ORM. The schema is four small tables;
Drizzle/Prisma would be pure overhead here.

```sql
create table tasks (
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
);
create index tasks_user_id_idx on tasks (user_id);

create table comments (
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
);
create index comments_user_id_idx on comments (user_id);
create index comments_ticket_id_idx on comments (ticket_id);

create table board_config (
  user_id text primary key,
  statuses jsonb not null,
  priorities jsonb not null,
  types jsonb not null,
  assignees jsonb not null
);

create table jira_config (
  user_id text primary key,
  base_url text not null default '',
  email text not null default '',
  project text not null default '',
  jql text not null default '',
  start_date_field_id text not null default '',
  github_branch_field_id text not null default '',
  api_token_enc text
);
```

Dates/timestamps stay as the same ISO strings the app already produces
(`src/lib/id.js`'s `nowIso`/`todayIso`) — stored as `text`, not `timestamp`,
to avoid any format-conversion surface. `id` values keep coming from
`newId()` client-side as they do today.

Migrations are a single `scripts/db-migrate.mjs` that runs the SQL above
with `IF NOT EXISTS` guards — no migration framework, matching this
project's existing "no build step beyond Next.js" philosophy
(`scripts/generate-guide.mjs` is the precedent).

### 3. API routes

New route handlers under `src/app/api/state/`:

- `GET /api/state` → `{ tasks, comments, config }` for `auth().userId`.
  If the user has no `board_config` row yet, returns
  `src/data/seed.json`'s `config` as the default (first-run UX unchanged)
  and empty `tasks`/`comments` (unless import applies — see §4).
- `POST /api/state/tasks`, `PATCH /api/state/tasks/:id`,
  `DELETE /api/state/tasks/:id`
- `POST /api/state/comments`, `DELETE /api/state/comments/:id`
- `PUT /api/state/config` (body: `{ key, values }`, mirrors
  `updateConfig`)

Each handler calls `const { userId } = await auth()` and scopes every
query to it (`where user_id = $1`); Clerk's middleware already guarantees
`userId` is non-null by the time a route handler runs.

`src/app/api/jira/config/route.js` and `src/lib/jiraCredentials.js` are
updated to read/write the `jira_config` table (keyed by `userId`) instead
of the `taskar_jira` cookie. `encrypt`/`decrypt` from
`src/lib/serverCrypto.js` are reused as-is — only the storage location
changes. The env-var fallback (`JIRA_BASE_URL` etc.) is preserved
unchanged.

### 4. Client: TaskContext swaps its storage backend

`loadInitialState()`'s localStorage read is replaced with a `GET
/api/state` call, gated on Clerk's `useAuth()` reporting a signed-in
user (the `hydrated` flag now means "fetched from the server," not
"read localStorage"). Every mutator (`addTask`, `updateTask`, ...) keeps
its existing optimistic local `setState` update, and additionally fires
the matching API call; a failed request sets a small `syncError` flag in
context state that `AppShell` renders as a dismissible banner with a
"Retry" button (re-runs the last failed call — no queue, just one retry
slot, since this is a single-user tool where a failed save is rare and
noticeable immediately).

The bulk localStorage `setState` → `localStorage.setItem` effect
(`TaskContext.js:59-66`) is deleted entirely; localStorage is no longer
the source of truth after this change.

### 5. First-login import of existing local data

On first sign-in, before calling `GET /api/state`, the client checks
`window.localStorage.getItem(STORAGE_KEY)`. If that data exists *and*
`GET /api/state` comes back with zero tasks *and* no `board_config` row
(i.e., truly first-time account, not "signed in on device #2 after
already syncing"), show a one-time confirmation: "Import this device's
existing tasks into your account?" On confirm, `POST /api/state/import`
with the full localStorage payload, which bulk-inserts tasks/comments and
writes `board_config` in one transaction. Either way (imported or
declined), `localStorage.setItem("taskar:import-offered:v1", "1")`
prevents the prompt from reappearing on this device.

If there's no local data to import and no server data yet, the account
starts from `seed.json`'s demo tasks — same first-run experience as
today, just persisted server-side from that point on.

### 6. What doesn't change

- `src/lib/jira.js` (Jira API client), `mergeJiraIssues`, `src/lib/id.js`,
  all components (`TaskTable`, `Board`, `TaskFormModal`,
  `CommentThread`, etc.) — they only ever talk to `useTasks()`.
- `src/data/seed.json` remains the default/demo content source.

## Testing (manual — no test runner is configured in this project)

- Sign up with email+password, add a task and a comment, edit board
  config (add a status), reload the page — all three persist.
- Sign in with the same account in a second browser (or an incognito
  window) — the task, comment, and config change all appear.
- On a browser that already has pre-existing `taskar:v1` localStorage
  data, sign in with a *brand-new* account — see the import prompt,
  confirm it, verify the imported tasks/comments match what was in
  localStorage.
- Sign in with a second, different brand-new account on the *same*
  browser right after the previous test — no import prompt this time
  (the `taskar:import-offered:v1` flag from the first account's sign-in
  already suppresses it), and the new account starts from seed data,
  not the first account's imported tasks.
- Configure a Jira connection via the UI, reload, confirm it's still
  configured; sign in as the same user on a different browser, confirm
  the Jira connection is there too.
- Sign out and hit `/tasks` directly — redirected to `/sign-in`.
