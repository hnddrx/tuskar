import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_AREAS,
  hasPermission,
  isPermission,
  normalizePermissions,
  permissionsForMember,
} from "./permissions.js";

test("every area names permissions, and every key is unique", () => {
  // A duplicated key would make one checkbox silently control two things.
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
  for (const area of PERMISSION_AREAS) {
    assert.ok(area.key && area.label, `${area.key} has no label`);
    assert.ok(area.permissions.length > 0, `${area.key} has no permissions`);
    for (const p of area.permissions) {
      assert.match(p.key, /^[a-z]+\.[a-z]+$/, `${p.key} is not area.action`);
      assert.ok(p.label && p.hint, `${p.key} has no label or hint`);
    }
  }
});

test("the defaults are real permissions, and stop short of the irreversible ones", () => {
  for (const key of DEFAULT_PERMISSIONS) {
    assert.ok(isPermission(key), `${key} is not a permission`);
  }
  // Deleting and reshaping the board are what another member cannot undo.
  assert.ok(!DEFAULT_PERMISSIONS.includes("tasks.delete"));
  assert.ok(!DEFAULT_PERMISSIONS.includes("comments.delete"));
  assert.ok(!DEFAULT_PERMISSIONS.includes("events.delete"));
  assert.ok(!DEFAULT_PERMISSIONS.includes("board.config"));
});

test("an unknown permission is not one, however it is spelled", () => {
  assert.equal(isPermission("tasks.view"), true);
  assert.equal(isPermission("tasks.destroy"), false);
  assert.equal(isPermission(""), false);
  assert.equal(isPermission(undefined), false);
  // The lookup must not walk the prototype chain.
  assert.equal(isPermission("constructor"), false);
  assert.equal(isPermission("__proto__"), false);
});

test("normalizing drops what we do not recognise", () => {
  // A client could send anything; a stored key could outlive the code that
  // understood it. Neither may grant something.
  assert.deepEqual(normalizePermissions(["tasks.view", "tasks.nope"]), ["tasks.view"]);
  assert.deepEqual(normalizePermissions(["__proto__"]), []);
  assert.deepEqual(normalizePermissions("tasks.view"), []);
  assert.deepEqual(normalizePermissions(null), []);
});

test("normalizing removes duplicates and fixes the order", () => {
  // Two equivalent sets must compare equal, and the screen must not reshuffle
  // its checkboxes between saves.
  const messy = ["comments.create", "tasks.view", "tasks.view", "tasks.create"];
  const tidy = normalizePermissions(messy);
  assert.deepEqual(tidy, ["tasks.view", "tasks.create", "comments.create"]);
  assert.deepEqual(normalizePermissions([...messy].reverse()), tidy);
});

test("an admin always has everything", () => {
  // Whoever hands out permissions cannot be locked out by them.
  assert.deepEqual(permissionsForMember({ isAdmin: true }), ALL_PERMISSIONS);
  assert.deepEqual(permissionsForMember({ isAdmin: true, stored: [] }), ALL_PERMISSIONS);
});

test("nobody having decided means the defaults, not nothing", () => {
  assert.deepEqual(permissionsForMember({ stored: null }), DEFAULT_PERMISSIONS);
  assert.deepEqual(permissionsForMember({}), DEFAULT_PERMISSIONS);
});

test("an empty list is a decision, and grants nothing", () => {
  // The difference between "not configured" and "configured to nothing" is
  // the whole point of storing a row at all.
  assert.deepEqual(permissionsForMember({ stored: [] }), []);
});

test("the returned set is a copy, so a caller cannot edit the defaults", () => {
  const first = permissionsForMember({});
  first.push("board.config");
  assert.deepEqual(permissionsForMember({}), DEFAULT_PERMISSIONS);
  assert.ok(!DEFAULT_PERMISSIONS.includes("board.config"));
});

test("checking a permission is a plain membership test", () => {
  assert.equal(hasPermission(["tasks.view"], "tasks.view"), true);
  assert.equal(hasPermission(["tasks.view"], "tasks.delete"), false);
  assert.equal(hasPermission([], "tasks.view"), false);
  assert.equal(hasPermission(null, "tasks.view"), false);
});
