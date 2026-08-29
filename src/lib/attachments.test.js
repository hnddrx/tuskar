import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAttachment,
  dispositionFor,
  MAX_ATTACHMENT_SIZE,
  formatFileSize,
} from "./attachments.js";

function file(name, over = {}) {
  return { name, type: "application/octet-stream", size: 1024, ...over };
}

test("an image is classified for inline display", () => {
  assert.deepEqual(classifyAttachment(file("shot.png", { type: "image/png" })), {
    kind: "image",
  });
});

test("an audio recording is classified for inline playback", () => {
  assert.deepEqual(classifyAttachment(file("memo.mp3", { type: "audio/mpeg" })), {
    kind: "audio",
  });
});

test("a PDF is accepted as a downloadable file", () => {
  assert.deepEqual(classifyAttachment(file("spec.pdf", { type: "application/pdf" })), {
    kind: "file",
  });
});

test("an Office document is accepted as a downloadable file", () => {
  assert.deepEqual(classifyAttachment(file("budget.xlsx")), { kind: "file" });
});

test("the extension check ignores case", () => {
  assert.deepEqual(classifyAttachment(file("REPORT.PDF")), { kind: "file" });
});

test("an executable is rejected", () => {
  const result = classifyAttachment(file("setup.exe"));
  assert.match(result.error, /not allowed/i);
});

test("an unknown extension is rejected", () => {
  assert.ok(classifyAttachment(file("mystery.qqq")).error);
});

test("a file with no extension is rejected", () => {
  assert.ok(classifyAttachment(file("README")).error);
});

test("an SVG is a download, never an inline image", () => {
  // Served inline from our own origin an SVG can execute script, so it is
  // deliberately not classified as "image".
  assert.deepEqual(classifyAttachment(file("logo.svg", { type: "image/svg+xml" })), {
    kind: "file",
  });
});

test("a spoofed content type cannot smuggle an executable past the check", () => {
  assert.ok(classifyAttachment(file("payload.exe", { type: "image/png" })).error);
});

test("a file over the size cap is rejected", () => {
  const result = classifyAttachment(file("huge.pdf", { size: MAX_ATTACHMENT_SIZE + 1 }));
  assert.match(result.error, /too large/i);
});

test("images and audio are served inline, everything else as a download", () => {
  assert.equal(dispositionFor("image"), "inline");
  assert.equal(dispositionFor("audio"), "inline");
  assert.equal(dispositionFor("file"), "attachment");
});

test("file sizes are shown in the largest sensible unit", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(900), "900 B");
  assert.equal(formatFileSize(1024), "1 KB");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5 MB");
});

test("an unknown file size renders as empty rather than NaN", () => {
  assert.equal(formatFileSize(undefined), "");
  assert.equal(formatFileSize(null), "");
});
