# Team tasks: dedicated pages + multiple assignees

Status: approved design, pending implementation plan
Date: 2026-08-26
Supersedes: §5 ("Client: TaskContext becomes context-aware, UI stays untouched") of
[2026-08-26-team-task-manager-design.md](2026-08-26-team-task-manager-design.md).
Everything else in that spec (Clerk Organizations, the separate `team_*` tables,
membership-as-assignee-source, the `/api/team/*` route tree) is unchanged and
this spec builds on it directly.

## Problem

Phase 1 made the *existing* Board/Task Table/Task Detail pages context-aware:
switching the active team in the org switcher swapped what they displayed
between personal and team data. In practice this means switching to a team
makes your personal tasks disappear from `/tasks` and `/board`, which isn't
what's wanted — personal and team task lists should both be reachable at
once. There's also currently only one assignee per team task; a task should
support multiple people.

Multiple teams (creating/belonging to more than one org, switching between
them) is **already fully supported** by Clerk's `<OrganizationSwitcher>` out
of the box — no code change needed there.

## Design

### 1. `TaskContext` splits into `personal` + `team`

`TaskProvider` keeps being the one provider mounted in the tree, but its
value shape changes from one org-branched dataset to two independent ones,
both loaded at once:

```js
{
  personal: { tasks, comments, config, addTask, updateTask, deleteTask,
              addComment, deleteComment, updateConfig, mergeJiraIssues, resetToSeed },
  team:     { tasks, comments, config, members, orgId, addTask, updateTask,
              deleteTask, addComment, deleteComment, updateConfig },
  hydrated, syncError, retrySync, dismissSyncError,
}
```

- **Personal** loads once per signed-in user and no longer reacts to the
  active org at all — this reverts the org-branching Phase 1 added to the
  fetch effect and every mutator. Behaves exactly like the app did before
  Phase 1 existed.
- **Team** loads whenever `orgId` (from `useAuth()`) is set, reloads on
  switching to a different team, and clears to empty when there's no active
  team. Same reset-before-refetch pattern Phase 1 already established for
  account/org switches — no stale flash of the previous team's data.
- `syncError`/`retrySync` stay shared/global (a failed request from either
  side surfaces the same way); not worth splitting per-scope for a
  single-user-at-a-time UI.

Every existing personal-only consumer (`AppShell`'s task counts, `Board`,
`TaskTable`, task detail, `TaskFormModal`, `CommentThread`, Auto Docs,
Dashboard, the Jira/Config pages) updates its `useTasks()` destructuring from
`const { tasks, config, addTask } = useTasks()` to
`const { personal: { tasks, config, addTask } } = useTasks()`. Nothing about
*how* they use that data changes — same shapes, same call signatures, just
read through `.personal`.

### 2. Dedicated team pages and nav

New routes, adapted from (not shared with) the personal ones, reading `team`
instead of `personal`:

- `/team/tasks` — Team Task Table
- `/team/board` — Team Board
- `/team/tasks/[id]` — Team Task Detail + comments

They're separate files from `src/app/tasks/page.js` / `board/page.js` /
`tasks/[id]/page.js`, not a shared parametrized component — assignee
handling now genuinely differs (multi-select vs. single free-text), and the
personal pages lose all org-awareness entirely. Forcing one component to
serve both would mean threading a `variant` prop through most of its JSX.

`AppShell`'s `NAV` gets two new always-visible entries, "Team Tasks" and
"Team Board", alongside the existing "Task Table"/"Board". Visiting either
without an active team (Personal Account selected, or no team joined yet)
renders an empty state pointing at the org switcher ("Select or create a
team above to see its tasks") instead of a table/board — no crash, no
redirect.

The team task detail page reuses `CommentThread` as-is (Task 10 already made
it org-aware for the author-field hiding) and gets its own assignee editor
(§3) instead of the personal page's single-select `InlineField`.

### 3. Multiple assignees

**Migration** (`scripts/db-migrate.mjs`, following the existing
`alter table ... add column if not exists` pattern used for
`notes.attachments`):

```sql
alter table team_tasks add column if not exists assignee_ids jsonb not null default '[]';
update team_tasks set assignee_ids = to_jsonb(array[assignee])
  where assignee is not null and assignee_ids = '[]';
alter table team_tasks drop column if exists assignee;
```

Clean break, not a compatibility shim — team tasks are pre-release, so the
old singular `assignee` column is backfilled into the array and dropped in
the same migration, not kept around.

**Data shape:** `rowToTeamTask` produces `assigneeIds: string[]` (raw Clerk
user IDs, what gets written back on save) and `assignees: [{id, name}]`
(resolved against `membersById` for display), replacing the old singular
`assignee`/`assigneeId` pair. The team task POST/PATCH routes accept
`assigneeIds` in the body and write the whole array on every write — same
"send the full replacement value" pattern already used for
`config.statuses`/`priorities`/`types`, no separate add-one/remove-one
endpoints.

**UI:** a new small shared component, `TeamAssigneePicker` — a
click-to-open checkbox list of the team's members (from `team.members`),
committing an array of IDs — used in two places:

- The team task create/edit modal's assignee field (replacing the personal
  form's single `<select>`).
- The team task detail page's inline assignee editor (replacing
  `InlineField`'s single-select for this one field — `InlineField` itself
  is untouched and keeps serving every single-value field on both detail
  pages).

Board/Task Table team views render assignees as a comma-separated list of
resolved names in the assignee cell/column (matching the existing plain-text
style; no avatars/chips in this pass).

### 4. What doesn't change

- Personal tables/routes/pages (`tasks`, `comments`, `board_config`,
  `/api/state/*`, `src/app/tasks`, `src/app/board`) — untouched beyond the
  `useTasks()` destructuring update in §1; behavior identical to before
  Phase 1.
- `notes`, Jira integration — untouched, personal-only, per the original
  spec's non-goals (still in force).
- Multi-team support — no code; already provided by
  `<OrganizationSwitcher hidePersonal={false} />`'s built-in "Create
  organization" flow.
- The `/api/team/*` route tree's shape, auth checks (`orgId` required,
  `created_by`/`author_user_id` server-derived), and the separate-tables
  design — all unchanged from Phase 1.

## Testing (manual — no test runner is configured in this project)

- With a team active, confirm `/tasks` and `/board` still show your personal
  tasks (not empty, not the team's) — the core regression this phase fixes.
- Create a team task via `/team/tasks`, assign it to two members, confirm
  both names show in the Team Task Table and Team Board.
- Open the task on `/team/tasks/[id]`, add/remove an assignee via the inline
  picker, reload, confirm it persisted.
- Visit `/team/tasks` and `/team/board` with no team active; confirm the
  empty-state prompt, not a crash or blank page.
- Create a second team via the org switcher's "Create organization", switch
  to it, confirm `/team/tasks` shows that team's (empty) board, not the
  first team's tasks.
- Switch Personal → Team A → Team B → Personal in one session without
  reloading; confirm no flash of stale data at any step, on both the
  personal and team pages.
