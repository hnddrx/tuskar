import { neon } from "@neondatabase/serverless";
import { clerkClient } from "@clerk/nextjs/server";

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
    attachments: row.attachments || [],
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
  const assigneeIds = Array.isArray(row.assignee_ids) ? row.assignee_ids : [];
  return {
    id: row.id,
    ticketId: row.ticket_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assigneeIds,
    assignees: assigneeIds.map((id) => ({ id, name: membersById[id] || "Unknown" })),
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
