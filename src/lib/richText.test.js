import test from "node:test";
import assert from "node:assert/strict";

import { fromPlainText, toPlainText, toMarkdown, toHtml, EMPTY_DOC } from "./richText.js";

const doc = (...content) => ({ type: "doc", content });
const para = (...content) => ({ type: "paragraph", content });
const text = (value, marks) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });

test("an empty document is a doc with one empty paragraph", () => {
  assert.deepEqual(EMPTY_DOC, { type: "doc", content: [{ type: "paragraph" }] });
});

test("legacy plain text becomes one paragraph per line", () => {
  assert.deepEqual(
    fromPlainText("first\nsecond"),
    doc(para(text("first")), para(text("second")))
  );
});

test("blank lines in legacy text become empty paragraphs, not dropped text", () => {
  assert.deepEqual(
    fromPlainText("a\n\nb"),
    doc(para(text("a")), { type: "paragraph" }, para(text("b")))
  );
});

test("empty legacy text becomes an empty document", () => {
  assert.deepEqual(fromPlainText(""), EMPTY_DOC);
  assert.deepEqual(fromPlainText(null), EMPTY_DOC);
});

test("carriage returns from pasted Windows text do not survive", () => {
  assert.deepEqual(fromPlainText("a\r\nb"), doc(para(text("a")), para(text("b"))));
});

test("plain text joins block content with newlines", () => {
  assert.equal(toPlainText(doc(para(text("one")), para(text("two")))), "one\ntwo");
});

test("plain text keeps formatted runs as their words", () => {
  const d = doc(para(text("plain "), text("bold", [{ type: "bold" }])));
  assert.equal(toPlainText(d), "plain bold");
});

test("plain text includes headings and list items so search can find them", () => {
  const d = doc(
    { type: "heading", attrs: { level: 2 }, content: [text("Agenda")] },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [para(text("first item"))] },
        { type: "listItem", content: [para(text("second item"))] },
      ],
    }
  );
  assert.equal(toPlainText(d), "Agenda\nfirst item\nsecond item");
});

test("plain text includes table cell contents", () => {
  const cell = (v) => ({ type: "tableCell", content: [para(text(v))] });
  const d = doc({
    type: "table",
    content: [{ type: "tableRow", content: [cell("Owner"), cell("Wren")] }],
  });
  assert.equal(toPlainText(d), "Owner\tWren");
});

test("a hard break inside a paragraph is a newline", () => {
  const d = doc(para(text("one"), { type: "hardBreak" }, text("two")));
  assert.equal(toPlainText(d), "one\ntwo");
});

test("an empty document yields an empty string", () => {
  assert.equal(toPlainText(EMPTY_DOC), "");
  assert.equal(toPlainText(null), "");
});

test("plain text round-trips legacy content unchanged", () => {
  const original = "line one\n\nline three";
  assert.equal(toPlainText(fromPlainText(original)), original);
});

// ---------------------------------------------------------------------------
// toMarkdown — what Auto Docs exports
// ---------------------------------------------------------------------------

test("paragraphs are separated by a blank line", () => {
  assert.equal(toMarkdown(doc(para(text("one")), para(text("two")))), "one\n\ntwo");
});

test("headings use their level", () => {
  const d = doc({ type: "heading", attrs: { level: 3 }, content: [text("Agenda")] });
  assert.equal(toMarkdown(d), "### Agenda");
});

test("inline marks become their markdown equivalents", () => {
  const d = doc(
    para(
      text("a", [{ type: "bold" }]),
      text("b", [{ type: "italic" }]),
      text("c", [{ type: "strike" }]),
      text("d", [{ type: "code" }])
    )
  );
  assert.equal(toMarkdown(d), "**a***b*~~c~~`d`");
});

test("a link becomes an inline markdown link", () => {
  const d = doc(para(text("docs", [{ type: "link", attrs: { href: "https://x.test" } }])));
  assert.equal(toMarkdown(d), "[docs](https://x.test)");
});

test("formatting markdown cannot express is dropped, not mangled", () => {
  // Colour and font size were accepted as export-lossy by design.
  const d = doc(
    para(text("plain", [{ type: "textStyle", attrs: { color: "#ff0000", fontSize: "24px" } }]))
  );
  assert.equal(toMarkdown(d), "plain");
});

test("a bullet list becomes dashes", () => {
  const d = doc({
    type: "bulletList",
    content: [
      { type: "listItem", content: [para(text("first"))] },
      { type: "listItem", content: [para(text("second"))] },
    ],
  });
  assert.equal(toMarkdown(d), "- first\n- second");
});

test("an ordered list numbers its items", () => {
  const d = doc({
    type: "orderedList",
    content: [
      { type: "listItem", content: [para(text("first"))] },
      { type: "listItem", content: [para(text("second"))] },
    ],
  });
  assert.equal(toMarkdown(d), "1. first\n2. second");
});

test("a checklist becomes markdown task boxes", () => {
  const d = doc({
    type: "taskList",
    content: [
      { type: "taskItem", attrs: { checked: true }, content: [para(text("done thing"))] },
      { type: "taskItem", attrs: { checked: false }, content: [para(text("open thing"))] },
    ],
  });
  assert.equal(toMarkdown(d), "- [x] done thing\n- [ ] open thing");
});

test("nested lists are indented under their parent item", () => {
  const d = doc({
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [
          para(text("outer")),
          { type: "bulletList", content: [{ type: "listItem", content: [para(text("inner"))] }] },
        ],
      },
    ],
  });
  assert.equal(toMarkdown(d), "- outer\n  - inner");
});

test("a blockquote prefixes every line", () => {
  const d = doc({ type: "blockquote", content: [para(text("we agreed to slip"))] });
  assert.equal(toMarkdown(d), "> we agreed to slip");
});

test("a code block is fenced with its language", () => {
  const d = doc({
    type: "codeBlock",
    attrs: { language: "sql" },
    content: [text("select 1")],
  });
  assert.equal(toMarkdown(d), "```sql\nselect 1\n```");
});

test("a code block without a language still fences", () => {
  const d = doc({ type: "codeBlock", attrs: {}, content: [text("plain")] });
  assert.equal(toMarkdown(d), "```\nplain\n```");
});

test("a horizontal rule becomes a thematic break", () => {
  assert.equal(toMarkdown(doc({ type: "horizontalRule" })), "---");
});

test("a table becomes a GitHub-flavoured markdown table", () => {
  const cell = (t, v) => ({ type: t, content: [para(text(v))] });
  const d = doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [cell("tableHeader", "Item"), cell("tableHeader", "Status")],
      },
      {
        type: "tableRow",
        content: [cell("tableCell", "Cart API"), cell("tableCell", "Done")],
      },
    ],
  });
  assert.equal(
    toMarkdown(d),
    "| Item | Status |\n| --- | --- |\n| Cart API | Done |"
  );
});

test("a pipe inside a cell is escaped so it cannot break the table", () => {
  const cell = (v) => ({ type: "tableCell", content: [para(text(v))] });
  const d = doc({
    type: "table",
    content: [{ type: "tableRow", content: [cell("a|b")] }],
  });
  assert.match(toMarkdown(d), /a\\|b/);
});

test("an empty document exports as an empty string", () => {
  assert.equal(toMarkdown(EMPTY_DOC), "");
});

// ---------------------------------------------------------------------------
// toHtml — what the Word export carries
// ---------------------------------------------------------------------------

test("bold, italic, underline and strike become semantic tags", () => {
  const d = doc(
    para(
      text("a", [{ type: "bold" }]),
      text("b", [{ type: "italic" }]),
      text("c", [{ type: "underline" }]),
      text("d", [{ type: "strike" }])
    )
  );
  assert.equal(toHtml(d), "<p><strong>a</strong><em>b</em><u>c</u><s>d</s></p>");
});

test("text is HTML-escaped so note content cannot inject markup", () => {
  const d = doc(para(text('<script>alert("x")</script>')));
  assert.equal(
    toHtml(d),
    "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>"
  );
});

test("colour and font size survive as inline styles", () => {
  const d = doc(
    para(text("urgent", [{ type: "textStyle", attrs: { color: "#ff0000", fontSize: "24px" } }]))
  );
  const html = toHtml(d);
  assert.match(html, /color:\s*#ff0000/);
  assert.match(html, /font-size:\s*24px/);
});

test("paragraph alignment survives as an inline style", () => {
  const d = doc({ type: "paragraph", attrs: { textAlign: "center" }, content: [text("hi")] });
  assert.match(toHtml(d), /text-align:\s*center/);
});

test("a heading renders at its level", () => {
  const d = doc({ type: "heading", attrs: { level: 2 }, content: [text("Agenda")] });
  assert.equal(toHtml(d), "<h2>Agenda</h2>");
});

test("a table renders with header cells and borders Word will honour", () => {
  const cell = (t, v) => ({ type: t, content: [para(text(v))] });
  const d = doc({
    type: "table",
    content: [
      { type: "tableRow", content: [cell("tableHeader", "Item")] },
      { type: "tableRow", content: [cell("tableCell", "Cart API")] },
    ],
  });
  const html = toHtml(d);
  assert.match(html, /<table[^>]*>/);
  assert.match(html, /<th[^>]*>.*Item.*<\/th>/);
  assert.match(html, /<td[^>]*>.*Cart API.*<\/td>/);
});

test("a checklist renders its checked state as a box", () => {
  const d = doc({
    type: "taskList",
    content: [
      { type: "taskItem", attrs: { checked: true }, content: [para(text("done"))] },
      { type: "taskItem", attrs: { checked: false }, content: [para(text("open"))] },
    ],
  });
  const html = toHtml(d);
  assert.match(html, /☑/);
  assert.match(html, /☐/);
});

test("a link renders as an anchor", () => {
  const d = doc(para(text("docs", [{ type: "link", attrs: { href: "https://x.test" } }])));
  assert.equal(toHtml(d), '<p><a href="https://x.test">docs</a></p>');
});

test("a javascript: link is stripped of its href", () => {
  const d = doc(
    para(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))
  );
  const html = toHtml(d);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /click/);
});

test("a hard break becomes a line break tag", () => {
  const d = doc(para(text("one"), { type: "hardBreak" }, text("two")));
  assert.equal(toHtml(d), "<p>one<br />two</p>");
});

test("a code block is preformatted", () => {
  const d = doc({ type: "codeBlock", attrs: {}, content: [text("select 1")] });
  assert.equal(toHtml(d), "<pre><code>select 1</code></pre>");
});

test("an empty document produces no markup", () => {
  assert.equal(toHtml(EMPTY_DOC), "<p></p>");
  assert.equal(toHtml(null), "");
});
