import test from "node:test";
import assert from "node:assert/strict";

import { generateNoteDoc, generateNoteWordHtml } from "./noteDocGenerator.js";

const baseNote = {
  id: "note_1",
  type: "freeform",
  title: "Sprint review",
  body: "",
  bodyRich: null,
  linkedTaskId: null,
  attendees: [],
  agenda: [],
  actionItems: [],
  createdAt: "2026-08-01T00:00:00.000Z",
};

const richBody = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "shipped", marks: [{ type: "bold" }] }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "cart api" }] }],
        },
      ],
    },
  ],
};

test("a rich note exports its formatting as markdown", () => {
  const doc = generateNoteDoc({ ...baseNote, bodyRich: richBody }, []);
  assert.match(doc, /\*\*shipped\*\*/);
  assert.match(doc, /- cart api/);
});

test("a note written before the rich editor still exports its plain text", () => {
  const doc = generateNoteDoc({ ...baseNote, body: "just plain words" }, []);
  assert.match(doc, /just plain words/);
});

test("an empty note still reports that it has no content", () => {
  assert.match(generateNoteDoc(baseNote, []), /_No content\._/);
});

test("a meeting note puts the rich discussion under its own heading", () => {
  const doc = generateNoteDoc(
    { ...baseNote, type: "mom", bodyRich: richBody, attendees: ["Wren"], agenda: ["Demo"] },
    []
  );
  assert.match(doc, /## Discussion/);
  assert.match(doc, /\*\*shipped\*\*/);
});

test("the Word export carries the note title", () => {
  const html = generateNoteWordHtml({ ...baseNote, bodyRich: richBody }, []);
  assert.match(html, /Sprint review/);
});

test("the Word export carries rich formatting as HTML", () => {
  const html = generateNoteWordHtml({ ...baseNote, bodyRich: richBody }, []);
  assert.match(html, /<strong>shipped<\/strong>/);
  assert.match(html, /<ul><li><p>cart api<\/p><\/li><\/ul>/);
});

test("the Word export is a complete document Word will open", () => {
  const html = generateNoteWordHtml(baseNote, []);
  assert.match(html, /^<html/i);
  assert.match(html, /charset=utf-8/i);
  assert.match(html, /<\/html>$/i);
});

test("a title containing markup cannot inject into the Word export", () => {
  const html = generateNoteWordHtml({ ...baseNote, title: "<script>x</script>" }, []);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("the Word export lists a meeting's attendees and action items", () => {
  const html = generateNoteWordHtml(
    {
      ...baseNote,
      type: "mom",
      attendees: ["Wren"],
      agenda: ["Demo"],
      actionItems: [{ id: "a1", text: "chase vendor", done: true, taskId: null }],
    },
    []
  );
  assert.match(html, /Wren/);
  assert.match(html, /Demo/);
  assert.match(html, /chase vendor/);
});
