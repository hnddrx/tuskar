// Record rules — which team tasks a member can see at all.
//
// The permission checkboxes in lib/permissions decide what someone may *do*.
// These decide what exists for them in the first place: a member with a rule
// set sees only the tasks that match it, everywhere at once — list, board,
// detail page — and cannot reach the others by URL either.
//
// Rules are evaluated in memory rather than compiled into the query. The team
// state route already reads every task across every team the person is in, so
// filtering afterwards costs little, and it means one evaluator rather than
// two implementations that could quietly disagree about the same rule. It also
// keeps dynamic SQL off a security boundary.
//
// Comments are deliberately not ruled on. A comment is visible when its task
// is, so someone restricted to their own work still sees the whole thread on
// the tasks they can see.

/** Stands in for the person the rule is about, so one rule fits everyone. */
export const ME = "$me";

export const RULE_OPERATORS = {
  includes: { label: "includes", needsValue: true },
  notIncludes: { label: "does not include", needsValue: true },
  is: { label: "is", needsValue: true },
  isNot: { label: "is not", needsValue: true },
  contains: { label: "contains", needsValue: true },
  notContains: { label: "does not contain", needsValue: true },
  before: { label: "is before", needsValue: true },
  after: { label: "is after", needsValue: true },
  isEmpty: { label: "is empty", needsValue: false },
  isNotEmpty: { label: "is set", needsValue: false },
};

// Operators are listed per field rather than globally: "includes" only means
// something for a list of assignees, "before" only for a date. Pairing them
// here is what stops an impossible rule being built or stored.
export const RULE_FIELDS = [
  {
    key: "assignees",
    label: "Assignee",
    kind: "people",
    operators: ["includes", "notIncludes", "isEmpty", "isNotEmpty"],
  },
  { key: "createdBy", label: "Created by", kind: "person", operators: ["is", "isNot"] },
  { key: "status", label: "Status", kind: "choice", operators: ["is", "isNot"] },
  { key: "priority", label: "Priority", kind: "choice", operators: ["is", "isNot"] },
  { key: "type", label: "Type", kind: "choice", operators: ["is", "isNot"] },
  { key: "name", label: "Name", kind: "text", operators: ["contains", "notContains"] },
  {
    key: "targetDate",
    label: "Target date",
    kind: "date",
    operators: ["before", "after", "isEmpty", "isNotEmpty"],
  },
];

const FIELDS_BY_KEY = Object.fromEntries(RULE_FIELDS.map((f) => [f.key, f]));

export function ruleField(key) {
  return Object.prototype.hasOwnProperty.call(FIELDS_BY_KEY, key) ? FIELDS_BY_KEY[key] : null;
}

/**
 * The rule set an admin starts from. "Their own work" is the case this was
 * built for: the tasks assigned to them, plus the ones they raised themselves
 * — without the second half, a member who creates a task and forgets to
 * assign it to themselves watches it disappear the moment it saves.
 */
export const RULE_PRESETS = [
  {
    key: "ownWork",
    label: "Only their own tasks",
    hint: "Tasks assigned to them, plus tasks they created",
    rules: {
      match: "any",
      conditions: [
        { field: "assignees", operator: "includes", value: ME },
        { field: "createdBy", operator: "is", value: ME },
      ],
    },
  },
  {
    key: "assignedOnly",
    label: "Only tasks assigned to them",
    hint: "Strictly where they are named as an assignee",
    rules: {
      match: "all",
      conditions: [{ field: "assignees", operator: "includes", value: ME }],
    },
  },
  {
    key: "openWork",
    label: "Their tasks and unclaimed work",
    hint: "Their own, plus anything nobody has picked up yet",
    rules: {
      match: "any",
      conditions: [
        { field: "assignees", operator: "includes", value: ME },
        { field: "createdBy", operator: "is", value: ME },
        { field: "assignees", operator: "isEmpty" },
      ],
    },
  },
];

function normalizeCondition(raw) {
  const field = ruleField(raw?.field);
  if (!field) return null;
  if (!field.operators.includes(raw.operator)) return null;

  const operator = RULE_OPERATORS[raw.operator];
  if (!operator.needsValue) return { field: field.key, operator: raw.operator };

  const value = raw.value;
  // A condition that needs a value and has none would silently match nothing
  // (or everything). Dropping it is the only safe reading.
  if (value === null || value === undefined || value === "") return null;
  return { field: field.key, operator: raw.operator, value: String(value) };
}

/**
 * Keeps only conditions we understand, and returns `null` for a rule set that
 * restricts nothing.
 *
 * An empty set normalizes to `null` rather than staying empty on purpose:
 * "match any of no conditions" is false, which would hide every task in the
 * team from that person because an admin removed the last row. Unrestricted is
 * the safer reading of an empty form, and the only one an admin would expect.
 */
export function normalizeRules(raw) {
  if (!raw || !Array.isArray(raw.conditions)) return null;
  const conditions = raw.conditions.map(normalizeCondition).filter(Boolean);
  if (conditions.length === 0) return null;
  return { match: raw.match === "any" ? "any" : "all", conditions };
}

function resolve(value, userId) {
  return value === ME ? userId : value;
}

function valueOf(task, field) {
  switch (field) {
    case "assignees":
      // Accepts either shape the app carries a task in: the raw row's
      // assignee_ids, or the mapped record's assigneeIds.
      return Array.isArray(task.assigneeIds)
        ? task.assigneeIds
        : Array.isArray(task.assignee_ids)
          ? task.assignee_ids
          : [];
    case "createdBy":
      return task.createdBy ?? task.created_by ?? null;
    case "targetDate":
      return task.targetDate ?? task.target_date ?? null;
    default:
      return task[field] ?? null;
  }
}

function testCondition(task, condition, userId) {
  const actual = valueOf(task, condition.field);
  const expected = resolve(condition.value, userId);

  switch (condition.operator) {
    case "includes":
      return Array.isArray(actual) && actual.includes(expected);
    case "notIncludes":
      return !Array.isArray(actual) || !actual.includes(expected);
    case "is":
      return String(actual ?? "") === String(expected ?? "");
    case "isNot":
      return String(actual ?? "") !== String(expected ?? "");
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "notContains":
      return !String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "before":
      return Boolean(actual) && String(actual) < String(expected);
    case "after":
      return Boolean(actual) && String(actual) > String(expected);
    case "isEmpty":
      return Array.isArray(actual) ? actual.length === 0 : !actual;
    case "isNotEmpty":
      return Array.isArray(actual) ? actual.length > 0 : Boolean(actual);
    default:
      // An operator we do not recognise never grants sight of a record.
      return false;
  }
}

/**
 * Can this person see this task?
 *
 * No rules means no restriction — the ordinary case, and what every member has
 * until an admin says otherwise.
 */
export function taskMatchesRules(task, rules, userId) {
  const normalized = normalizeRules(rules);
  if (!normalized) return true;
  const results = normalized.conditions.map((c) => testCondition(task, c, userId));
  return normalized.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

/** The tasks this person may see, in the order they arrived. */
export function visibleTasks(tasks = [], rules, userId) {
  const normalized = normalizeRules(rules);
  if (!normalized) return tasks;
  return tasks.filter((t) => taskMatchesRules(t, normalized, userId));
}

/**
 * A rule set read back as a sentence, for the access screen and for saying why
 * something is hidden. Ids are swapped for names where the caller knows them.
 */
export function describeRules(rules, names = {}) {
  const normalized = normalizeRules(rules);
  if (!normalized) return "Sees every task in the team";

  const parts = normalized.conditions.map((c) => {
    const field = ruleField(c.field);
    const operator = RULE_OPERATORS[c.operator];
    if (!operator.needsValue) return `${field.label} ${operator.label}`;
    const value = c.value === ME ? "them" : names[c.value] || c.value;
    return `${field.label} ${operator.label} ${value}`;
  });

  return `Sees tasks where ${parts.join(normalized.match === "any" ? " or " : " and ")}`;
}
