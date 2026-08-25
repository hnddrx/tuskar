# Notes & Minutes of Meeting (MOM)

Status: approved design, pending implementation plan
Date: 2026-08-25

## Problem

Taskar has no place to capture freeform notes or meeting minutes. Users
currently have to keep those outside the app entirely, disconnected from
the tasks they relate to. This spec adds a standalone Notes section —
freeform notes and a structured Minutes-of-Meeting (MOM) type — with
auto-document export (mirroring the existing Auto Docs feature for tasks)
and a one-click way to turn a MOM action item into a real Task.

Voice-recognition dictation into the note editor, and app-wide dark mode,
are explicitly out of scope for this spec — they're separate sub-projects
(voice depends on the Notes editor existing; dark mode is fully
independent) to be designed and built next.

## Non-goals

- No rich-text/WYSIWYG editing. Note bodies are plain text (Markdown-
  flavored, unrendered while editing), same as task descriptions today —
  matches this project's existing "small, direct, no extra abstraction"
  style (see `src/components/TaskFormModal.js`'s description `<textarea>`).
- No tagging/categorization beyond the two note types (`freeform`, `mom`)
  and the optional linked task. No full power-search/filter/pagination
  like the Task Table — a simple client-side text + type filter is enough
  at personal-notes scale.
- No global `NotesContext`. Tasks uses a global context because many
  unrelated pages read task data (Board, Table, Overview, AppShell's open
  count). Notes are read only by the Notes pages, so they fetch locally
  instead — see Design §3.
- No voice input, no dark mode (see Problem).
- No realtime sync / multi-editor conflict resolution, consistent with
  the rest of the app (see `docs/superpowers/specs/2026-08-25-cloud-sync-design.md`'s
  non-goals) — last-write-wins.

## Design

### 1. Data model (Postgres)

One new table, scoped by `user_id` like every other table in this app:

```sql
create table notes (
  id text primary key,
  user_id text not null,
  type text not null,               -- 'freeform' | 'mom'
  title text not null,
  body text not null default '',    -- freeform text: the note; mom: "Discussion" section
  linked_task_id text,
  attendees jsonb not null default '[]',      -- mom only: string[]
  agenda jsonb not null default '[]',         -- mom only: string[]
  action_items jsonb not null default '[]',   -- mom only: {id, text, done, taskId}[]
  created_at text not null,
  updated_at text not null
);
create index notes_user_id_idx on notes (user_id);
```

`attendees`/`agenda`/`action_items` stay empty arrays for `freeform` notes.
Dates/timestamps follow the existing convention: ISO strings as `text`,
produced by `nowIso()`/`todayIso()` from `src/lib/id.js` — not native
`timestamp` columns, avoiding format-conversion surface (same reasoning as
the `tasks`/`comments` tables).

`src/lib/db.js` gains a `rowToNote(row)` mapper alongside the existing
`rowToTask`/`rowToComment`, converting `snake_case` DB columns to the
`camelCase` shape used everywhere in JS (`linkedTaskId`, `actionItems`,
`createdAt`, `updatedAt`).

`scripts/db-migrate.mjs` gains the `create table if not exists notes (...)`
block above, run the same way (`npm run db:migrate`).

### 2. API routes

New route handlers under `src/app/api/notes/`, following the exact shape
of `src/app/api/state/*` (auth-gated by `src/proxy.js`, scoped by
`const { userId } = await auth()`, no ORM):

- `GET /api/notes` → all of the signed-in user's notes, newest first.
- `POST /api/notes` → creates a note (client sends the full record,
  including a client-generated `id` from `newId("note")` — same pattern
  as `POST /api/state/tasks`).
- `PATCH /api/notes/:id` → partial update, merged server-side against the
  existing row (same merge-on-server approach as
  `PATCH /api/state/tasks/:id`, so the client only ever sends the fields
  that changed — including the whole `actionItems` array when one item's
  `done`/`taskId` changes, since it's stored as a single JSONB column).
- `DELETE /api/notes/:id`.

No dedicated "convert action item to task" route — see §5.

### 3. Pages & components

- New "Notes" entry in `AppShell`'s `NAV` array, route `/notes`.
- `src/app/notes/page.js` — list page. On mount, fetches
  `GET /api/notes` into local `useState` (no context — this is the one
  place in the app that reads note data, so a page-local fetch is
  simpler than wiring a provider through `layout.js` for a single
  consumer). Renders newest-first; each row shows title, a type badge
  (Freeform/MOM), a one-line snippet of `body`, the linked task's name if
  set, and the date. A text input filters client-side by
  title/body-substring; a segmented control filters by type
  (All/Freeform/MOM). A "New note" button offers the two types, then
  navigates to `/notes/new?type=freeform` or `?type=mom`. A "Compile all
  notes" button calls `generateNotesCompilationDoc()` (§4) on the
  in-memory list and downloads it — no extra fetch needed.
- `src/app/notes/new/page.js` and `src/app/notes/[id]/page.js` — the
  editor, sharing a `NoteEditor` component (`src/components/NoteEditor.js`)
  parameterized by `mode: "create" | "edit"`, mirroring how
  `src/app/tasks/[id]/page.js` and task creation both lean on shared task
  components. Fields:
  - Title (text input).
  - "Link to task" — a searchable `<select>` over the current user's
    tasks (reads `useTasks()` from the already-global `TaskContext` —
    Notes pages may still consume `TaskContext` read-only; the "no
    NotesContext" decision only means Notes doesn't get its *own* global
    provider), optional.
  - **Freeform:** a single body `<textarea>`.
  - **MOM:** attendees (add/remove chip list, each backed by a plain
    string), agenda (add/remove list of topic strings), a body
    `<textarea>` labeled "Discussion", and action items (add/remove list
    of `{id, text, done}` rows, each with a checkbox and, once
    `taskId` is set, a link to that task instead of the checkbox — see
    §5).
  - A per-note "Export" button calls `generateNoteDoc()` (§4) and
    downloads it.
  - Saving: create posts once on submit (`POST /api/notes`, then
    redirects to `/notes/:id`). Edits follow the same pending-changes
    pattern as the task detail page (`src/app/tasks/[id]/page.js`):
    field edits accumulate in local `pendingChanges` state (not written
    immediately), a dirty indicator appears, and an explicit "Save"
    button calls `PATCH /api/notes/:id` with just the changed fields
    (a "Discard" button clears `pendingChanges` without saving). The
    action-item conversion in §5 is the one exception — it saves
    immediately on click, since it's a discrete action rather than a
    field edit.

### 4. Auto-doc generation

New `src/lib/noteDocGenerator.js`, a sibling to the existing
`src/lib/docGenerator.js` (kept separate rather than added to it — Notes
and Tasks are different concerns, and `docGenerator.js` is already scoped
entirely to the task-shaped document format):

- `generateNoteDoc(note, linkedTask)` → Markdown for one note.
  - Freeform: `# {title}`, a metadata line (`**Type:** Freeform |
    **Date:** ... ` plus `**Linked task:** {ticketId} — {name}` if set),
    then the body.
  - MOM: `# {title}`, the same metadata line, `## Attendees` (bullet
    list), `## Agenda` (bullet list), `## Discussion` (the body text),
    `## Action Items` (a `- [ ]`/`- [x]` checklist; a checked item that
    has a `taskId` appends `→ {ticketId}` linking to the created task).
- `generateNotesCompilationDoc(notes)` → mirrors the existing
  `generateProjectDoc()`: a table of contents linking to each note by
  title, then every note's `generateNoteDoc()` output concatenated with
  `---` separators.
- Both reuse the existing `downloadMarkdown()` helper unchanged.

### 5. Action-item → Task conversion

No new API route. The "Convert to Task" button in the MOM editor:

1. Calls the *existing* `addTask({ name: item.text, syncSource: "Manual" })`
   from `useTasks()` (the same `TaskContext.addTask` every other task
   creation path in the app already uses) — this returns the new task's
   `id` synchronously (client-generated, same as every other task).
2. Updates the action item in local editor state:
   `{ ...item, taskId: newTaskId }`.
3. Sends the updated `actionItems` array via
   `PATCH /api/notes/:id` (whole-array replace, since it's one JSONB
   column — same partial-patch endpoint as any other note field).

This reuses the one tested, existing task-creation path instead of
duplicating task-insert SQL in a second place. The UI swaps the checkbox
for a link to `/tasks/:taskId` once `taskId` is set — a converted action
item can't be un-converted (no delete-the-task-on-uncheck behavior; the
task, once created, is managed normally from the Tasks pages like any
other task).

Conversion requires the note to already exist server-side (step 3 PATCHes
by id), so on `/notes/new` the "Convert to Task" button is disabled with
a "Save this note first" hint until the initial `POST /api/notes` has
completed and the page has navigated to `/notes/:id`.

### 6. Error handling

Notes has no global context, so there's no app-wide sync banner for it
(that stays task-specific, per the cloud-sync spec). A failed
create/update/delete shows a small inline "Failed to save — Retry"
indicator directly in the editor (or list row, for delete), with a Retry
button that re-fires the same request. This is deliberately simpler than
`TaskContext`'s `syncError`/`retrySync` mechanism since it only ever needs
to cover one in-flight edit at a time on a single-note editor page.

### 7. Relationship to existing features

- `src/context/TaskContext.js` is unchanged except that its `addTask` is
  now also called from the Notes editor (§5) — no change to its own
  logic or public API.
- `src/app/api/state/*` is unchanged; Notes gets its own
  `src/app/api/notes/*` tree rather than folding into `/api/state`,
  keeping the two concerns' request/response shapes independent.
- `src/lib/docGenerator.js` is unchanged; `noteDocGenerator.js` is
  additive.
- `AppShell`'s `NAV` array gets one new entry; no other navigation
  changes.

## Testing (manual — no test runner is configured in this project)

- Create a freeform note, reload `/notes` — it persists and appears in
  the list.
- Create a MOM note with attendees, agenda items, and two action items;
  reload — all fields persist, including the action items' `done` state.
- Convert one action item to a task; confirm a real task appears in the
  Task Table with the action item's text as its name, and the MOM editor
  now shows a link to that task instead of a checkbox for that item.
- Link a note to an existing task; confirm the task's name/ticket shows
  on both the note list row and the editor.
- Export a single note and confirm the downloaded Markdown matches its
  type's format (§4). Export "Compile all notes" and confirm it contains
  every note with a working table of contents.
- Search/filter on the Notes list: type a substring only present in one
  note's body, confirm only that note shows; switch the type filter to
  MOM-only, confirm freeform notes disappear from the list.
- Delete a note, confirm it's gone after reload.
- Sign in as the same account in a second browser context, confirm all
  notes (and the linked-task associations) appear there too — same
  per-account Postgres scoping as tasks.
