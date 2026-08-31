import { roomConversationId } from "./chat.js";

/**
 * Narrowing the team views to one team.
 *
 * Team pages list every team you belong to by default. A "?team=" on the URL
 * narrows them to one, which is how the sidebar's per-team entries link to a
 * single team's tasks, board and room without you having to switch teams
 * first. An unknown or absent id means "all teams" rather than "nothing", so
 * a stale link degrades to the wider view instead of an empty page.
 */

export const TEAM_PARAM = "team";
export const CHAT_PARAM = "c";

export function teamTasksHref(orgId) {
  return orgId ? "/team/tasks?" + TEAM_PARAM + "=" + encodeURIComponent(orgId) : "/team/tasks";
}

export function teamBoardHref(orgId) {
  return orgId ? "/team/board?" + TEAM_PARAM + "=" + encodeURIComponent(orgId) : "/team/board";
}

export function teamManageHref(orgId) {
  return orgId ? "/team/manage?" + TEAM_PARAM + "=" + encodeURIComponent(orgId) : "/team/manage";
}

export function teamAccessHref(orgId) {
  return orgId ? "/team/access?" + TEAM_PARAM + "=" + encodeURIComponent(orgId) : "/team/access";
}

export function teamChatHref(orgId) {
  return orgId ? "/chat?" + CHAT_PARAM + "=" + encodeURIComponent(roomConversationId(orgId)) : "/chat";
}

/** The id in the URL, but only if it is a team you are actually in. */
export function resolveTeamScope(param, orgs = []) {
  if (!param) return null;
  return (orgs || []).some((o) => o.id === param) ? param : null;
}

export function tasksForTeam(tasks = [], orgId) {
  return orgId ? tasks.filter((t) => t.orgId === orgId) : tasks;
}

/**
 * Teams whose name matches what was typed into the sidebar search.
 *
 * A blank or whitespace-only query means "everything" rather than "nothing",
 * so clearing the box restores the full list instead of emptying it.
 */
export function filterTeams(orgs = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return orgs;
  return orgs.filter((o) => (o.name || "").toLowerCase().includes(q));
}

/**
 * The people who can be assigned in a given team. A member from an older
 * payload that predates per-member team ids is kept rather than dropped —
 * an over-wide picker beats one that is silently empty.
 */
export function membersForTeam(members = [], orgId) {
  if (!orgId) return members;
  return members.filter((m) => !m.orgIds || m.orgIds.includes(orgId));
}
