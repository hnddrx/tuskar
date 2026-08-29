import test from "node:test";
import assert from "node:assert/strict";

import {
  teamTasksHref,
  teamBoardHref,
  teamChatHref,
  resolveTeamScope,
  tasksForTeam,
  membersForTeam,
} from "./teamScope.js";

const ORGS = [{ id: "org_a", name: "Alpha" }, { id: "org_b", name: "Beta" }];

test("links carry the team, and drop it for the all-teams view", () => {
  assert.equal(teamTasksHref("org_a"), "/team/tasks?team=org_a");
  assert.equal(teamBoardHref("org_a"), "/team/board?team=org_a");
  assert.equal(teamChatHref("org_a"), "/chat?c=room%3Aorg_a");

  assert.equal(teamTasksHref(null), "/team/tasks");
  assert.equal(teamBoardHref(null), "/team/board");
  assert.equal(teamChatHref(null), "/chat");
});

test("a team you are not in reads as no scope, not as an empty one", () => {
  assert.equal(resolveTeamScope("org_a", ORGS), "org_a");
  assert.equal(resolveTeamScope("org_stranger", ORGS), null);
  assert.equal(resolveTeamScope(null, ORGS), null);
  assert.equal(resolveTeamScope("org_a", []), null);
});

test("tasks narrow to one team, or stay whole with no scope", () => {
  const tasks = [
    { id: "1", orgId: "org_a" },
    { id: "2", orgId: "org_b" },
    { id: "3", orgId: "org_a" },
  ];
  assert.deepEqual(tasksForTeam(tasks, "org_a").map((t) => t.id), ["1", "3"]);
  assert.deepEqual(tasksForTeam(tasks, "org_b").map((t) => t.id), ["2"]);
  assert.equal(tasksForTeam(tasks, null).length, 3);
});

test("assignees narrow to the team the task belongs to", () => {
  const members = [
    { id: "u1", orgIds: ["org_a"] },
    { id: "u2", orgIds: ["org_b"] },
    { id: "u3", orgIds: ["org_a", "org_b"] },
  ];
  assert.deepEqual(membersForTeam(members, "org_a").map((m) => m.id), ["u1", "u3"]);
  assert.deepEqual(membersForTeam(members, "org_b").map((m) => m.id), ["u2", "u3"]);
  assert.equal(membersForTeam(members, null).length, 3);
});

test("a member with no team ids is kept rather than silently dropped", () => {
  const members = [{ id: "u1" }, { id: "u2", orgIds: ["org_b"] }];
  assert.deepEqual(membersForTeam(members, "org_a").map((m) => m.id), ["u1"]);
});
