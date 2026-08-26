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
  await sql`create index if not exists notes_user_id_idx on notes (user_id)`;

  console.log("Migration complete: tasks, comments, board_config, jira_config, notes ready.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
