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

export function rowToNote(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkedTaskId: row.linked_task_id,
    attendees: row.attendees,
    agenda: row.agenda,
    actionItems: row.action_items,
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
