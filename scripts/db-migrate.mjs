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

  // Progress is derived from status and subtasks (see lib/progress.js) unless
  // a task opts out. Jira-synced tasks opt out by default: their progress
  // comes from Jira and must not be overwritten by our own rule.
  await sql`alter table tasks add column if not exists progress_auto boolean not null default true`;
  await sql`update tasks set progress_auto = false where sync_source <> 'Manual'`;

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
  // Status name -> percent complete, driving automatic progress for tasks
  // with no subtasks. Empty means "not configured"; the API falls back to
  // DEFAULT_STATUS_PROGRESS so the feature works before anyone visits
  // Configuration.
  await sql`alter table board_config add column if not exists status_progress jsonb not null default '{}'`;

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

  await sql`
    create table if not exists notes (
      id text primary key,
      user_id text not null,
      type text not null,
      title text not null,
      body text not null default '',
      linked_task_id text,
      attendees jsonb not null default '[]',
      agenda jsonb not null default '[]',
      action_items jsonb not null default '[]',
      attachments jsonb not null default '[]',
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`alter table notes add column if not exists attachments jsonb not null default '[]'`;
  // The rich note document (Tiptap/ProseMirror JSON). `body` is kept as a
  // derived plain-text mirror of it, so search and previews need no changes
  // and pre-rich notes need no backfill — they simply have a null body_rich
  // and get lifted into a document the first time they are opened.
  await sql`alter table notes add column if not exists body_rich jsonb`;
  await sql`create index if not exists notes_user_id_idx on notes (user_id)`;

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
      assignee_ids jsonb not null default '[]',
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
  await sql`alter table team_tasks add column if not exists progress_auto boolean not null default true`;
  await sql`update team_tasks set progress_auto = false where sync_source <> 'Manual'`;

  // Migrate a pre-existing team_tasks table from single `assignee` (a
  // nullable Clerk user id) to the `assignee_ids` jsonb array above. Only
  // runs against a table that still has the old column — a no-op on a
  // fresh install, which already gets assignee_ids from the create above.
  await sql`alter table team_tasks add column if not exists assignee_ids jsonb not null default '[]'`;
  const [legacyAssigneeColumn] = await sql`
    select 1 from information_schema.columns
    where table_name = 'team_tasks' and column_name = 'assignee'
  `;
  if (legacyAssigneeColumn) {
    await sql`
      update team_tasks set assignee_ids = to_jsonb(array[assignee])
      where assignee is not null and assignee_ids = '[]'::jsonb
    `;
    await sql`alter table team_tasks drop column assignee`;
  }

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
  // Who a comment @-mentions. Stored as resolved Clerk user ids rather than
  // re-parsed from the text later, so a member renaming themselves cannot
  // change who an old comment was addressed to.
  await sql`alter table team_comments add column if not exists mentions jsonb not null default '[]'`;
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
  await sql`alter table team_board_config add column if not exists status_progress jsonb not null default '{}'`;

  // Calendar events (meetings/invites), kept in per-scope tables for the same
  // reason tasks are: a query against one can never return the other's rows.
  // `attendees` is a snapshot of [{name, email}] at creation time — unlike a
  // task's assignees, an invite's guest list is a point-in-time artifact and
  // shouldn't retroactively change when team membership does.
  await sql`
    create table if not exists calendar_events (
      id text primary key,
      user_id text not null,
      title text not null,
      description text not null default '',
      location text not null default '',
      event_date text not null,
      start_time text,
      end_time text,
      attendees jsonb not null default '[]',
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`create index if not exists calendar_events_user_id_idx on calendar_events (user_id)`;

  await sql`
    create table if not exists team_calendar_events (
      id text primary key,
      org_id text not null,
      title text not null,
      description text not null default '',
      location text not null default '',
      event_date text not null,
      start_time text,
      end_time text,
      attendees jsonb not null default '[]',
      created_by text not null,
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`create index if not exists team_calendar_events_org_id_idx on team_calendar_events (org_id)`;

  // Outgoing mail server, configured from the UI exactly like Jira: one row
  // per user, with the password encrypted at rest (serverCrypto.js) and never
  // returned to the browser.
  await sql`
    create table if not exists smtp_config (
      user_id text primary key,
      label text not null default '',
      host text not null default '',
      port integer not null default 587,
      security text not null default 'starttls',
      username text not null default '',
      password_enc text,
      from_name text not null default '',
      from_email text not null default '',
      updated_at text
    )
  `;

  // Time tracking. Unlike tasks, a time entry is always owned by the person
  // who recorded it, so personal and team work share one table and are told
  // apart by `scope` rather than living in separate tables.
  await sql`
    create table if not exists time_entries (
      id text primary key,
      user_id text not null,
      scope text not null default 'personal',
      org_id text,
      task_id text,
      description text not null default '',
      started_at text not null,
      ended_at text,
      duration_seconds integer,
      source text not null default 'timer',
      created_at text not null,
      updated_at text not null
    )
  `;
  await sql`create index if not exists time_entries_user_id_idx on time_entries (user_id)`;
  await sql`create index if not exists time_entries_task_id_idx on time_entries (task_id)`;
  // A running entry is one with no end time. This makes "at most one timer
  // running per person" a database guarantee rather than something the API
  // has to get right on every path, including concurrent ones.
  await sql`
    create unique index if not exists time_entries_one_running_idx
    on time_entries (user_id) where ended_at is null
  `;

  // Team chat. A conversation is either the team room or a direct message;
  // a DM has no row of its own, its id being derived from the pair (see
  // lib/chat.js), so there is nothing to keep in sync.
  await sql`
    create table if not exists chat_messages (
      id text primary key,
      org_id text not null,
      conversation_id text not null,
      author_user_id text not null,
      body text not null default '',
      created_at text not null
    )
  `;
  // Reads are always "this conversation, in order, after a cursor".
  await sql`
    create index if not exists chat_messages_conversation_idx
    on chat_messages (org_id, conversation_id, created_at)
  `;

  // A file sent with a message, stored the same way note attachments are.
  await sql`alter table chat_messages add column if not exists attachment jsonb`;

  // Presence is a heartbeat, not a socket: each client stamps its last-seen
  // time while its tab is visible, and status is derived from how stale that
  // is (see lib/chat.js).
  await sql`
    create table if not exists chat_presence (
      user_id text not null,
      org_id text not null,
      last_seen_at text not null,
      primary key (user_id, org_id)
    )
  `;

  await sql`
    create table if not exists chat_reads (
      user_id text not null,
      org_id text not null,
      conversation_id text not null,
      last_read_at text not null,
      primary key (user_id, org_id, conversation_id)
    )
  `;

  // Direct messages belong to the two people, not to a team, so they keep
  // working when you switch teams or use a personal account. That makes a
  // conversation id stand alone, which in turn means a room id has to name its
  // organization: a bare "room" meant a different conversation to every team.
  await sql`alter table chat_messages alter column org_id drop not null`;
  await sql`
    update chat_messages set conversation_id = 'room:' || org_id
    where conversation_id = 'room'
  `;
  await sql`update chat_messages set org_id = null where conversation_id like 'dm:%'`;

  // Read state and presence were keyed by organization; neither is
  // organization-scoped any more. Reshaped in place so existing read markers
  // and heartbeats survive.
  const [readsOrgColumn] = await sql`
    select 1 from information_schema.columns
    where table_name = 'chat_reads' and column_name = 'org_id'
  `;
  if (readsOrgColumn) {
    await sql`
      update chat_reads set conversation_id = 'room:' || org_id
      where conversation_id = 'room'
    `;
    // Collapse rows that the reshape would turn into duplicate keys, keeping
    // the most recent read marker.
    await sql`
      delete from chat_reads a using chat_reads b
      where a.ctid < b.ctid and a.user_id = b.user_id
        and a.conversation_id = b.conversation_id
        and a.last_read_at <= b.last_read_at
    `;
    await sql`alter table chat_reads drop constraint if exists chat_reads_pkey`;
    await sql`alter table chat_reads drop column org_id`;
    await sql`alter table chat_reads add primary key (user_id, conversation_id)`;
  }

  const [presenceOrgColumn] = await sql`
    select 1 from information_schema.columns
    where table_name = 'chat_presence' and column_name = 'org_id'
  `;
  if (presenceOrgColumn) {
    await sql`
      delete from chat_presence a using chat_presence b
      where a.ctid < b.ctid and a.user_id = b.user_id
        and a.last_seen_at <= b.last_seen_at
    `;
    await sql`alter table chat_presence drop constraint if exists chat_presence_pkey`;
    await sql`alter table chat_presence drop column org_id`;
    await sql`alter table chat_presence add primary key (user_id)`;
  }

  console.log(
    "Migration complete: tasks, comments, board_config, jira_config, notes, team_tasks, team_comments, team_board_config, calendar_events, team_calendar_events, time_entries, smtp_config, chat_messages, chat_reads, chat_presence ready."
  );
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
