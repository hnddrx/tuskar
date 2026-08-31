import test from "node:test";
import assert from "node:assert/strict";

import { rowToAttachment, safeAttachmentName } from "./attachmentStore.js";

test("a row becomes a descriptor without leaking column names", () => {
  const row = {
    id: "attachment_1",
    owner_kind: "note",
    owner_id: "note_1",
    user_id: "user_1",
    org_id: null,
    uploaded_by: "user_1",
    filename: "spec.pdf",
    content_type: "application/pdf",
    size: "20480",
    kind: "file",
    pathname: "notes/user_1/note_1/attachment_1-spec.pdf",
    created_at: "2026-08-31T09:00:00.000Z",
  };

  assert.deepEqual(rowToAttachment(row), {
    id: "attachment_1",
    filename: "spec.pdf",
    contentType: "application/pdf",
    // Postgres hands bigint back as a string; the client is given a number.
    size: 20480,
    kind: "file",
    pathname: "notes/user_1/note_1/attachment_1-spec.pdf",
    uploadedBy: "user_1",
    createdAt: "2026-08-31T09:00:00.000Z",
  });
});

test("a missing or unreadable size reads as zero rather than NaN", () => {
  assert.equal(rowToAttachment({ size: null }).size, 0);
  assert.equal(rowToAttachment({ size: "not a number" }).size, 0);
  assert.equal(rowToAttachment({}).size, 0);
});

test("a filename keeps its extension, which decides how it is served", () => {
  // The tail is kept rather than the head: classification and the inline vs
  // download decision both key on the extension.
  const long = `${"a".repeat(200)}.pdf`;
  const safe = safeAttachmentName(long);
  assert.equal(safe.length, 80);
  assert.ok(safe.endsWith(".pdf"));
});

test("path separators and spaces cannot survive into a blob path", () => {
  assert.equal(safeAttachmentName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(safeAttachmentName("my report.pdf"), "my_report.pdf");
  const backslash = String.fromCharCode(92);
  assert.equal(safeAttachmentName(`a${backslash}b.txt`), "a_b.txt");
});

test("distinct names stay distinct — characters are replaced, not stripped", () => {
  // Stripping would collapse "a b.txt" and "ab.txt" onto one name, and one
  // upload would overwrite the other in the blob store.
  assert.notEqual(safeAttachmentName("a b.txt"), safeAttachmentName("ab.txt"));
});

test("a nameless upload still gets a name", () => {
  assert.equal(safeAttachmentName("", "image"), "image");
  assert.equal(safeAttachmentName(null, "image"), "image");
  assert.equal(safeAttachmentName(undefined), "file");
  // Everything replaced still leaves something usable, never an empty path.
  assert.equal(safeAttachmentName("///", "image"), "___");
});
