# Team task manager, Phase 1 (Clerk Organizations + shared task board)

Status: approved design, pending implementation plan
Date: 2026-08-26

## Problem

Taskar is single-user: every table (`tasks`, `comments`, `board_config`, `notes`)
is scoped by `user_id`, and [cloud-sync-design.md](2026-08-25-cloud-sync-design.md)
explicitly called "no sharing / multi-tenant features" a non-goal. The user now
wants real collaboration — a shared task board, notes, and comments a team can
work from together — while keeping their existing personal space exactly as it
is today.

## Non-goals (this phase)

- **Team notes.** Explicitly deferred to a Phase 2 spec that reuses the
  pattern this phase establishes. In Phase 1, `/notes` always shows the
  signed-in user's personal notes, regardless of which team is active.
  Task *comments* are in scope for Phase 1, not deferred with notes — they're
  a property of a task (rendered on the task detail page, tracked via
  `comment_count` on the task row), not a standalone feature, so a working
  team task board needs them from the start.
- **Custom roles / granular permissions.** Every team member (`org:admin` or
  `org:member`) can create, edit, and delete any task or comment on their
  team's board. No per-task ownership restrictions, no read-only role.
- **Jira import into a team board.** Jira credentials and import stay
  personal-only. The Jira import UI is hidden while a team is the active
  context.
- **"Reset to seed" for teams.** A team board has no demo/seed content to
  reset to; the action is hidden in team context.
- **Migrating/promoting personal tasks into a team.** A team board starts
  empty; members add to it directly.
- **Enterprise SSO, verified domains, seat billing.** Not relevant to a
  personal-tool-turned-small-team use case.

## Design

### 1. Clerk: Organizations

Enabled via Clerk Dashboard (Organizations settings) in **Membership
optional** mode — critically *not* the default "Membership required" mode,
since that disables personal accounts entirely and this app's personal space
must keep working exactly as it does today. Default roles only:
`org:admin` (manage the team + members) and `org:member` (full read/write on
the team's board). No custom roles for Phase 1.

`<OrganizationSwitcher hidePersonal={false} />` is added to `AppShell`
(alongside the existing `<UserButton />`), giving users a way to create a
team, accept/send invitations, and switch their **active context** between
"Personal Account" and any team they belong to. Clerk's invitation system
(email-based, sent from its own infrastructure) handles the entire
invite-and-join flow — no custom invite code needed.

### 2. Data model — separate tables, not a shared `team_id` filter

Three new tables, mirroring the shape of `tasks`/`comments`/`board_config`
but keyed by Clerk's `org_id` instead of `user_id`:

```sql
create table team_tasks (
  id text primary key,
  org_id text not null,
  ticket_id text not null,
  parent_id text,
  type text not null,
  name text not null,
  status text not null,
  priority text not null,
  assignee text,                    -- Clerk user_id of the assigned member, or null
  start_date text,
  target_date text,
  progress integer not null default 0,
  last_update text,
  description text not null default '',
  github_branch text not null default 'N/A',
  jira_link text,
  comment_count integer not null default 0,
  sync_source text not null default 'Manual',
  created_by text not null,         -- Clerk user_id, set server-side from auth()
  created_at text not null,
  updated_at text not null
);
create index team_tasks_org_id_idx on team_tasks (org_id);

create table team_comments (
  id text primary key,
  org_id text not null,
  ticket_id text not null,
  parent_comment_id text,
  created text not null,
  updated text not null,
  author_user_id text not null,     -- Clerk user_id, set server-side from auth()
  text text not null default '',
  jira_issue_link text,
  sync_source text not null default 'Manual'
);
create index team_comments_org_id_idx on team_comments (org_id);
create index team_comments_ticket_id_idx on team_comments (ticket_id);

create table team_board_config (
  org_id text primary key,
  statuses jsonb not null,
  priorities jsonb not null,
  types jsonb not null
  -- no `assignees` column: the assignee list for a team is its actual
  -- membership (see §3), not a hand-typed roster like the personal config.
);
```

Deliberately **separate tables**, not one shared table with a `team_id`
column, even though that would mean less new schema: correctness with a
shared table depends on *every* query remembering to filter `team_id is
null` (personal) vs. `team_id = X` (team), forever. A missed filter would be
a genuine cross-scope data leak. Separate tables make that class of bug
structurally impossible — a query against `team_tasks` can never return a
row from `tasks`.

`assignee` and `author_user_id`/`created_by` are real Clerk user IDs, not
free-text strings. This is a deliberate change from the personal side's
free-text `assignee`/`author` fields (which trust whatever the client sends,
fine for a single-user table): for team data, trusting a client-supplied
identity would let one member post a comment or claim authorship as someone
else. `created_by` and `author_user_id` are always taken from `auth().userId`
server-side, never from the request body.

### 3. Team membership as the assignee list

Rather than a hand-typed roster (the exact pattern that caused the
"phantom names" confusion fixed earlier — see the account-leak
investigation), the assignee dropdown for a team task is populated from the
team's **actual Clerk membership**. A new `GET /api/team/members` route
calls `clerkClient().organizations.getOrganizationMembershipList({
organizationId })` and returns each member's user ID, name, and email. The
client resolves `assignee` (a user ID) to a display name/avatar from this
list — never stores a name string that can go stale or point at someone
who's left the team.

### 4. API routes — a parallel tree, scoped by `orgId`

New routes under `/api/team/`, mirroring `/api/state/*` almost exactly:

- `GET /api/team/state` → `{ tasks, comments, config }` for `auth().orgId`
- `POST/PATCH/DELETE /api/team/state/tasks[/:id]`
- `POST/DELETE /api/team/state/comments[/:id]`
- `PUT /api/team/state/config`
- `GET /api/team/members`

Every handler reads `const { userId, orgId } = await auth()` and returns
`400` if `orgId` is null (no active team) before touching the database —
the same shape as today's `userId`-scoped routes, just scoped on the org
instead.

### 5. Client: `TaskContext` becomes context-aware, UI stays untouched

`useTasks()` is called directly by 9 components/pages today (`AppShell`,
`CommentThread`, `TaskFormModal`, `Board`, `TaskTable`, the dashboard,
auto-docs, task detail, config page). Rather than duplicating any of that UI
for a "team" variant, `TaskProvider` itself becomes aware of the active
Clerk organization:

- Reads `orgId` (in addition to `userId`) from `useAuth()`.
- The data-loading effect's target becomes `orgId ? "/api/team/state" :
  "/api/state"`, and re-runs — resetting local state first, exactly like the
  account-switch fix already shipped — whenever *either* `userId` or `orgId`
  changes. Switching teams (or back to Personal) behaves identically to the
  account-switch case: immediate clear, then a fresh fetch, never a stale
  flash of the previous context's data.
- Every mutator (`addTask`, `updateTask`, `deleteTask`, `addComment`,
  `deleteComment`, `updateConfig`) posts to the team routes instead of the
  personal ones when `orgId` is set. The public shape of `useTasks()` is
  unchanged, so every consuming component needs zero code changes.
- `mergeJiraIssues` and `resetToSeed` become no-ops (or hide their triggering
  UI) when a team is active, per the non-goals above.

This means the existing Board, Task Table, Task detail, Comment thread,
Auto Docs, and Dashboard pages all work for team boards immediately, for
free, once the provider is context-aware — no parallel component tree.

### 6. What doesn't change

- `notes` and its routes/pages — untouched, always personal, in this phase.
- Jira integration (`src/lib/jira.js`, `jiraCredentials.js`) — untouched,
  personal-only.
- `src/data/seed.json`, the personal `tasks`/`comments`/`board_config`
  tables and routes — untouched.

## Testing (manual — no test runner is configured in this project)

- Create a team via the org switcher, confirm the board starts empty with
  default statuses/priorities/types and no seed/demo content.
- Invite a second account by email, accept the invite, confirm both accounts
  see the same tasks/comments on that team's board.
- Add a task and assign it to a specific member; confirm the assignee shows
  that member's real name, not a free-text label.
- Switch the active context Personal → Team → a second Team → Personal in
  one session without reloading; confirm the board, task table, and comment
  threads always show the right data immediately, with no flash of the
  previous context (reusing the account-switch fix's reset pattern).
- Confirm Jira import and "Reset to seed" are hidden/disabled while a team
  is active, and that switching back to Personal restores them.
- Confirm `/notes` shows personal notes regardless of active team.
- Remove a member from a team (as `org:admin`); confirm they lose access to
  that team's board on next load.
