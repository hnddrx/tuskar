# Breadcrumb navigation (Odoo-style)

Status: approved design, pending implementation plan
Date: 2026-08-24

## Problem

The Task Detail page's only way back to where you came from is a "Back"
button (`router.back()`) plus, if the task has a parent, a separate small
link to that parent. Neither preserves the Task Table's search / filters /
sort / page if you navigate away and back, and there's no visible trail
when a task is several levels deep in a subtask chain. This spec adds an
Odoo-style breadcrumb trail — `Task Table / OB2B-111 / 7501 Audit Engine`
— above the Task Detail page, with the root segment restoring the exact
list state you left, and every ancestor task in the trail clickable.

Scope is Task Table, Board, and Auto Docs, since those are the only three
pages that link into `/tasks/[id]`. Board and Auto Docs have no filterable
state of their own (confirmed by reading both files), so their breadcrumb
root is a static link — only Task Table needs state preservation.

## Non-goals

- No breadcrumbs on Config, Jira Import, Overview, or Guide — none of
  them drill into a sub-record.
- No change to the Columns picker (`taskar:columns:v1` in localStorage)
  — that's a display preference, not view state, and stays as-is.
- No re-parenting UI or other new task-editing functionality.

## Design

### 1. Task Table state moves into the URL

`src/app/tasks/page.js` currently holds `query`, `filters`, `sort`, `page`,
`pageSize` in local `useState`, initialized fresh on every mount. This
spec moves them to the URL's query string, using Next.js's
`useSearchParams()` / `useRouter()`:

| State | Query param(s) |
|---|---|
| `query` | `q` |
| `filters.statuses` | `status` (repeated, e.g. `?status=Blocked&status=Done`) |
| `filters.priorities` | `priority` (repeated) |
| `filters.assignees` | `assignee` (repeated) |
| `filters.source` | `source` (omitted when `"all"`) |
| `filters.dueFrom` / `dueTo` | `dueFrom` / `dueTo` |
| `filters.createdFrom` / `createdTo` | `createdFrom` / `createdTo` |
| `sort.key` / `sort.dir` | `sort` / `dir` |
| `page` | `page` (omitted when `1`) |
| `pageSize` | `pageSize` (omitted when `25`, the default) |

State is read once from `searchParams` on mount to build the initial
`filters`/`sort`/`page`/`pageSize`/`query` values (same defaults as
today when a param is absent), and every setter that currently calls
`setQuery`/`setFilters`/`setSort`/`setPage`/`setPageSize` additionally
calls `router.replace(buildTasksUrl(nextState), { scroll: false })` so
the address bar always reflects the live view. `scroll: false` and
`replace` (not `push`) keep this from spamming browser history or
jumping the scroll position on every keystroke in the search box.

### 2. Carrying "where you came from" into a task

Every link into `/tasks/[id]` gets two extra query params:

- `from` — URL-encoded path + query string to link back to
- `fromLabel` — display text for the breadcrumb root

Task Table's row links build `from` from the current URL's own search
string (so it always matches exactly what's on screen, including
whatever wasn't yet flushed to the address bar this tick — read via
`searchParams.toString()` directly, not component state). Board and
Auto Docs links are static: `from=%2Fboard&fromLabel=Board` and
`from=%2Fdocs&fromLabel=Auto+Docs`.

If `from`/`fromLabel` are absent (a bookmarked or directly-pasted
`/tasks/{id}` URL), the Task Detail page defaults to
`from=/tasks`, `fromLabel="Task Table"` — a reasonable fallback since
there's no prior list state to recover.

### 3. Breadcrumb trail on Task Detail

New `src/components/Breadcrumbs.js`:

```
<Breadcrumbs items={[{ label, href }, ..., { label }]} />
```

The last item has no `href` and renders as plain (non-link) text — it's
the current page. Earlier items render as links, `/`-separated, styled
like the existing small "Back" link text it replaces.

`src/app/tasks/[id]/page.js` builds `items` as:

```
[{ label: fromLabel, href: from },
 ...ancestors.map(a => ({ label: a.ticketId, href: buildTaskHref(a.id) })),
 { label: task.ticketId }]
```

`ancestors` is computed by walking `task.parentId` against the
already-loaded `tasks` array from `useTasks()` (oldest ancestor first) —
no new data fetching. `buildTaskHref(id)` appends the *same* `from` /
`fromLabel` the current page received, so clicking any ancestor keeps
the trail's root link intact instead of resetting it.

The existing "Back" button and the separate small parent-task link both
go away, replaced by this one component.

### 4. What doesn't change

- `TaskContext`, `updateTask`, comments, config — untouched.
- The inline-editing work from the previous session is unaffected; this
  only touches the page's header/navigation area.
- Board's drag-and-drop and Docs' preview selector are untouched beyond
  adding `from`/`fromLabel` to their outbound task links.

## Testing (manual — no test runner is configured in this project)

- Task Table: set a search term + a status filter + sort by priority +
  page 2, open a task, click the breadcrumb root — table shows the same
  search/filter/sort/page.
- Open a subtask two levels deep (e.g. a subtask of a subtask, if one
  exists in seed data, otherwise create one) — breadcrumb shows every
  ancestor, each clickable.
- Open a task from Board and from Auto Docs — breadcrumb root reads
  "Board" / "Auto Docs" respectively and links back correctly.
- Paste a bare `/tasks/{id}` URL with no query params — breadcrumb
  falls back to "Task Table" → `/tasks` without erroring.
- Confirm browser back/forward still work normally (no extra history
  entries from the `router.replace` calls).
