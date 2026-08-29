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
    progressAuto: row.progress_auto !== false,
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
    bodyRich: row.body_rich || null,
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

// Shared by both the personal and team calendar tables — their columns are
// identical apart from the scope key and `created_by`.
export function rowToCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Time entries are always owned by the person who recorded them, so unlike
// tasks there is no personal/team split here — `scope` says which board the
// tracked task belongs to.
export function rowToTimeEntry(row) {
  return {
    id: row.id,
    scope: row.scope,
    orgId: row.org_id ?? null,
    taskId: row.task_id ?? null,
    description: row.description,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    durationSeconds: row.duration_seconds ?? null,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToChatMessage(row, membersById = {}) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorUserId: row.author_user_id,
    author: membersById[row.author_user_id] || "Unknown",
    body: row.body,
    attachment: row.attachment || null,
    createdAt: row.created_at,
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

export function rowToTeamTask(row, membersById = {}, orgNames = {}) {
  const assigneeIds = Array.isArray(row.assignee_ids) ? row.assignee_ids : [];
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: orgNames[row.org_id] || null,
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
    progressAuto: row.progress_auto !== false,
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
    orgId: row.org_id,
    ticketId: row.ticket_id,
    parentCommentId: row.parent_comment_id,
    created: row.created,
    updated: row.updated,
    author: membersById[row.author_user_id] || "Unknown",
    authorUserId: row.author_user_id,
    text: row.text,
    // Resolved Clerk user ids, stored rather than re-parsed from the text, so
    // a member renaming themselves cannot change who an old comment addressed.
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    jiraIssueLink: row.jira_issue_link,
    syncSource: row.sync_source,
  };
}

/**
 * Every organization a user belongs to.
 *
 * Access to a team room is decided by membership rather than by whichever
 * team happens to be selected, so switching teams cannot open or close a
 * conversation you were already in.
 */
/** Every organization a user belongs to, with its name. */
export async function getUserOrgs(userId) {
  if (!userId) return [];
  const clerk = await clerkClient();
  const { data } = await clerk.users.getOrganizationMembershipList({
    userId,
    limit: 100,
  });
  return data
    .map((m) => ({ id: m.organization?.id, name: m.organization?.name || "Team" }))
    .filter((o) => o.id);
}

export async function getUserOrgIds(userId) {
  if (!userId) return [];
  const clerk = await clerkClient();
  const { data } = await clerk.users.getOrganizationMembershipList({
    userId,
    limit: 100,
  });
  return data.map((m) => m.organization?.id).filter(Boolean);
}

/** Everyone the user shares a team with, keyed by user id. */
export async function getReachableMembers(userId) {
  const orgIds = await getUserOrgIds(userId);
  const clerk = await clerkClient();
  const byId = new Map();

  for (const orgId of orgIds) {
    const { data } = await clerk.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });
    for (const m of data) {
      const id = m.publicUserData?.userId;
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name:
          [m.publicUserData.firstName, m.publicUserData.lastName].filter(Boolean).join(" ") ||
          m.publicUserData.identifier ||
          "Unknown",
        email: m.publicUserData.identifier || null,
      });
    }
  }
  return { orgIds, members: [...byId.values()] };
}
