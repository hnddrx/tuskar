import test from "node:test";
import assert from "node:assert/strict";

import {
  ME,
  RULE_FIELDS,
  RULE_OPERATORS,
  RULE_PRESETS,
  describeRules,
  normalizeRules,
  ruleField,
  taskMatchesRules,
  visibleTasks,
} from "./recordRules.js";

const SAM = "user_sam";
const JO = "user_jo";

// The worked example from the design: six tasks, one restricted member.
const TASKS = [
  { id: "1", name: "TSK-1", assigneeIds: [SAM, JO], createdBy: JO, status: "In Progress" },
  { id: "2", name: "TSK-2", assigneeIds: [JO], createdBy: JO, status: "Done" },
  { id: "3", name: "TSK-3", assigneeIds: [], createdBy: JO, status: "To Do" },
  { id: "4", name: "TSK-4", assigneeIds: [], createdBy: SAM, status: "To Do" },
  { id: "5", name: "TSK-5", assigneeIds: [SAM], createdBy: JO, status: "To Do" },
  { id: "6", name: "TSK-6", assigneeIds: [JO], createdBy: SAM, status: "To Do" },
];

function preset(key) {
  return RULE_PRESETS.find((p) => p.key === key).rules;
}

test("every field pairs only with operators that exist", () => {
  for (const field of RULE_FIELDS) {
    assert.ok(field.label && field.kind, `${field.key} is not described`);
    assert.ok(field.operators.length > 0, `${field.key} has no operators`);
    for (const op of field.operators) {
      assert.ok(RULE_OPERATORS[op], `${field.key} names unknown operator ${op}`);
    }
  }
});

test("a field is only a field if it is one of ours", () => {
  assert.equal(ruleField("assignees").key, "assignees");
  assert.equal(ruleField("salary"), null);
  // The lookup must not walk the prototype chain into Object.
  assert.equal(ruleField("constructor"), null);
  assert.equal(ruleField("__proto__"), null);
  assert.equal(ruleField(undefined), null);
});

test("no rules means no restriction", () => {
  assert.equal(taskMatchesRules(TASKS[1], null, SAM), true);
  assert.equal(visibleTasks(TASKS, null, SAM).length, 6);
  assert.equal(visibleTasks(TASKS, undefined, SAM).length, 6);
});

test("the own-work preset shows assigned and created, and nothing else", () => {
  // Exactly the worked example: 1, 4, 5 and 6 visible; 2 and 3 hidden.
  const seen = visibleTasks(TASKS, preset("ownWork"), SAM).map((t) => t.name);
  assert.deepEqual(seen, ["TSK-1", "TSK-4", "TSK-5", "TSK-6"]);
});

test("the assigned-only preset ignores who created the task", () => {
  const seen = visibleTasks(TASKS, preset("assignedOnly"), SAM).map((t) => t.name);
  assert.deepEqual(seen, ["TSK-1", "TSK-5"]);
});

test("the unclaimed-work preset adds tasks nobody has taken", () => {
  const seen = visibleTasks(TASKS, preset("openWork"), SAM).map((t) => t.name);
  assert.deepEqual(seen, ["TSK-1", "TSK-3", "TSK-4", "TSK-5", "TSK-6"]);
});

test("one person's rules do not leak into another's view", () => {
  // $me is why a single rule can be attached to everyone.
  // Jo sees everything except TSK-4, which Sam raised and nobody was given.
  const jo = visibleTasks(TASKS, preset("ownWork"), JO).map((t) => t.name);
  assert.deepEqual(jo, ["TSK-1", "TSK-2", "TSK-3", "TSK-5", "TSK-6"]);
});

test("match all narrows, match any widens", () => {
  const both = {
    match: "all",
    conditions: [
      { field: "assignees", operator: "includes", value: ME },
      { field: "status", operator: "is", value: "Done" },
    ],
  };
  assert.deepEqual(visibleTasks(TASKS, both, SAM).map((t) => t.name), []);
  assert.deepEqual(
    visibleTasks(TASKS, { ...both, match: "any" }, SAM).map((t) => t.name),
    ["TSK-1", "TSK-2", "TSK-5"]
  );
});

test("a task row straight from the database matches the same way", () => {
  // The route filters rows before they are mapped, so both shapes must work.
  const row = { assignee_ids: [SAM], created_by: JO, target_date: "2026-09-01" };
  assert.equal(taskMatchesRules(row, preset("assignedOnly"), SAM), true);
  assert.equal(taskMatchesRules(row, preset("assignedOnly"), JO), false);
});

test("emptiness is tested without a value", () => {
  const unassigned = {
    match: "all",
    conditions: [{ field: "assignees", operator: "isEmpty" }],
  };
  assert.deepEqual(visibleTasks(TASKS, unassigned, SAM).map((t) => t.name), ["TSK-3", "TSK-4"]);
});

test("dates compare as ISO strings, and a missing date is never in range", () => {
  const tasks = [
    { name: "early", targetDate: "2026-01-01" },
    { name: "late", targetDate: "2026-12-01" },
    { name: "none", targetDate: null },
  ];
  const before = { match: "all", conditions: [{ field: "targetDate", operator: "before", value: "2026-06-01" }] };
  assert.deepEqual(visibleTasks(tasks, before, SAM).map((t) => t.name), ["early"]);
});

test("text matching ignores case", () => {
  const rules = { match: "all", conditions: [{ field: "name", operator: "contains", value: "tsk-1" }] };
  assert.deepEqual(visibleTasks(TASKS, rules, SAM).map((t) => t.name), ["TSK-1"]);
});

test("normalizing drops conditions we do not understand", () => {
  // Rules arrive from an admin's browser and are stored for later; neither an
  // invented field nor an operator the field does not take may survive.
  const raw = {
    match: "all",
    conditions: [
      { field: "assignees", operator: "includes", value: ME },
      { field: "salary", operator: "is", value: "1" },
      { field: "assignees", operator: "before", value: "2026-01-01" },
      { field: "__proto__", operator: "is", value: "x" },
    ],
  };
  assert.deepEqual(normalizeRules(raw).conditions, [
    { field: "assignees", operator: "includes", value: ME },
  ]);
});

test("a condition that needs a value and has none is dropped", () => {
  const raw = {
    match: "all",
    conditions: [
      { field: "status", operator: "is", value: "" },
      { field: "status", operator: "is" },
    ],
  };
  assert.equal(normalizeRules(raw), null);
});

test("an emptied rule set means unrestricted, never invisible", () => {
  // "Match any of no conditions" is false, which would hide every task in the
  // team because an admin deleted the last row. That must not be the reading.
  assert.equal(normalizeRules({ match: "any", conditions: [] }), null);
  assert.equal(normalizeRules({ match: "all", conditions: [] }), null);
  assert.equal(normalizeRules({}), null);
  assert.equal(normalizeRules(null), null);
  assert.equal(visibleTasks(TASKS, { match: "any", conditions: [] }, SAM).length, 6);
});

test("an unknown match mode narrows rather than widens", () => {
  const rules = {
    match: "sometimes",
    conditions: [
      { field: "assignees", operator: "includes", value: ME },
      { field: "status", operator: "is", value: "Done" },
    ],
  };
  // Anything that is not "any" is treated as "all" — the stricter reading.
  assert.equal(normalizeRules(rules).match, "all");
  assert.deepEqual(visibleTasks(TASKS, rules, SAM), []);
});

test("rules read back as a sentence, with names where we know them", () => {
  assert.equal(describeRules(null), "Sees every task in the team");
  assert.equal(
    describeRules(preset("ownWork")),
    "Sees tasks where Assignee includes them or Created by is them"
  );
  assert.equal(
    describeRules(
      { match: "all", conditions: [{ field: "createdBy", operator: "is", value: JO }] },
      { [JO]: "Jo" }
    ),
    "Sees tasks where Created by is Jo"
  );
});
