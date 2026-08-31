// What a team member is allowed to do.
//
// Until now membership was the only check: anyone in a team could edit or
// delete any task, comment, event or board setting in it. This module names
// the things that can be permitted, so the API routes and the access screen
// agree on one list rather than each inventing its own.
//
// Permissions are stored as an array of keys. A key that is not in
// ALL_PERMISSIONS is dropped on the way in and on the way out — a stored
// permission the code no longer understands must never grant anything, and a
// client cannot invent one.

export const PERMISSION_AREAS = [
  {
    key: "tasks",
    label: "Tasks",
    permissions: [
      { key: "tasks.view", label: "View", hint: "See the team's tasks and board" },
      { key: "tasks.create", label: "Create", hint: "Add new tasks" },
      { key: "tasks.edit", label: "Edit", hint: "Change any task's details" },
      { key: "tasks.delete", label: "Delete", hint: "Archive tasks" },
    ],
  },
  {
    key: "comments",
    label: "Comments",
    permissions: [
      { key: "comments.create", label: "Comment", hint: "Reply on team tasks" },
      { key: "comments.delete", label: "Delete", hint: "Archive comments" },
    ],
  },
  {
    key: "events",
    label: "Calendar",
    permissions: [
      { key: "events.view", label: "View", hint: "See the team calendar" },
      { key: "events.create", label: "Create", hint: "Add events" },
      // No "edit": team events can be created and archived, but there is no
      // route that changes one, so a checkbox for it would grant nothing.
      { key: "events.delete", label: "Delete", hint: "Archive events" },
    ],
  },
  {
    key: "board",
    label: "Board setup",
    permissions: [
      {
        key: "board.config",
        label: "Configure",
        hint: "Change statuses, priorities and types for everyone",
      },
    ],
  },
];

/** Every permission key, in the order the access screen shows them. */
export const ALL_PERMISSIONS = PERMISSION_AREAS.flatMap((area) =>
  area.permissions.map((p) => p.key)
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

/**
 * What someone gets when nobody has decided for them: take part in the work,
 * but do not reshape or remove it. Deleting and board setup are deliberately
 * out — those are the actions another member cannot undo.
 */
export const DEFAULT_PERMISSIONS = [
  "tasks.view",
  "tasks.create",
  "tasks.edit",
  "comments.create",
  "events.view",
  "events.create",
];

export function isPermission(key) {
  return PERMISSION_SET.has(key);
}

/**
 * Keeps only permissions we recognise, without duplicates, in the canonical
 * order. Order is fixed so two equivalent sets compare equal and the access
 * screen never reorders itself between saves.
 */
export function normalizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const held = new Set(list.filter((k) => PERMISSION_SET.has(k)));
  return ALL_PERMISSIONS.filter((k) => held.has(k));
}

/**
 * The permissions in force for one member.
 *
 * An admin always has everything: the person who can hand out permissions
 * cannot be locked out of the team by them. `stored` of `null` means nobody
 * has decided yet, so the defaults apply — but an empty array is a decision,
 * and grants nothing.
 */
export function permissionsForMember({ isAdmin = false, stored = null } = {}) {
  if (isAdmin) return [...ALL_PERMISSIONS];
  if (!Array.isArray(stored)) return [...DEFAULT_PERMISSIONS];
  return normalizePermissions(stored);
}

/** Does this set of permissions allow `key`? */
export function hasPermission(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}
