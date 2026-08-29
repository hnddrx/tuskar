// Serializers for the note editor's rich document.
//
// Notes are stored as a ProseMirror/Tiptap document (a plain JSON tree), and
// everything else in the app reads a projection of it rather than the tree
// itself:
//
//   toPlainText  search and the list previews, and the mirrored `body` column
//   toMarkdown   Auto Docs exports
//   toHtml       the Word-compatible export
//
// Structured JSON rather than an HTML string is deliberate: nothing here can
// smuggle markup into a page, so rendering a note never needs sanitizing.
// These are pure functions with no Tiptap import, so they run on the server,
// in the browser, and under `node --test` alike.

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// Notes written before the rich editor existed only have a plain `body`.
// Rather than migrate the table, they are lifted into a document on the fly
// the first time one is opened.
export function fromPlainText(value) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return EMPTY_DOC;
  const content = raw
    .split(/\r?\n/)
    .map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }
    );
  return { type: "doc", content };
}

// Blocks whose children are laid out side by side rather than stacked.
const CELL_TYPES = ["tableCell", "tableHeader"];

function childrenOf(node) {
  return Array.isArray(node?.content) ? node.content : [];
}

// Collects each block as its own line. Inline content within a block is
// concatenated, so a sentence broken across formatting marks stays one line
// and a search for it still matches.
function blockLines(node) {
  if (!node) return [];
  const { type } = node;

  if (type === "text") return [node.text || ""];
  if (type === "hardBreak") return ["\n"];

  if (type === "tableRow") {
    return [childrenOf(node).map((cell) => blockLines(cell).join("")).join("\t")];
  }
  if (CELL_TYPES.includes(type)) {
    return [childrenOf(node).flatMap(blockLines).join(" ")];
  }

  const children = childrenOf(node).flatMap(blockLines);

  // Inline containers collapse to a single line; block containers keep one
  // line per child.
  if (type === "paragraph" || type === "heading" || type === "codeBlock") {
    return [children.join("")];
  }
  return children;
}

export function toPlainText(doc) {
  if (!doc) return "";
  return blockLines(doc).join("\n");
}

// ---------------------------------------------------------------------------
// Markdown — what Auto Docs exports
// ---------------------------------------------------------------------------

function marksOf(node) {
  return Array.isArray(node?.marks) ? node.marks : [];
}

// Colour, font size, highlight and alignment have no Markdown equivalent and
// are deliberately dropped here rather than approximated; the Word export
// carries them instead.
function inlineMarkdown(node) {
  if (node?.type === "hardBreak") return "  \n";
  if (node?.type !== "text") return childrenOf(node).map(inlineMarkdown).join("");

  let out = node.text || "";
  const marks = marksOf(node);
  const has = (type) => marks.some((m) => m.type === type);

  if (has("code")) out = "`" + out + "`";
  if (has("bold")) out = "**" + out + "**";
  if (has("italic")) out = "*" + out + "*";
  if (has("strike")) out = "~~" + out + "~~";

  const link = marks.find((m) => m.type === "link");
  if (link?.attrs?.href) out = "[" + out + "](" + link.attrs.href + ")";
  return out;
}

function inlineOf(node) {
  return childrenOf(node).map(inlineMarkdown).join("");
}

function listItemMarkdown(item, marker, indent) {
  const lines = [];
  childrenOf(item).forEach((child, i) => {
    if (i === 0) {
      lines.push(indent + marker + blockMarkdown(child, indent).trim());
    } else {
      // Anything after the item's own paragraph (typically a nested list)
      // belongs under it.
      lines.push(blockMarkdown(child, indent + "  "));
    }
  });
  return lines.join("\n");
}

function cellMarkdown(cell) {
  return childrenOf(cell)
    .map((child) => inlineOf(child))
    .join(" ")
    .split("|")
    .join(String.raw`\|`);
}

function tableMarkdown(node) {
  const rows = childrenOf(node).map((row) => childrenOf(row).map(cellMarkdown));
  if (rows.length === 0) return "";
  const render = (cells) => "| " + cells.join(" | ") + " |";
  const [header, ...body] = rows;
  const separator = render(header.map(() => "---"));
  return [render(header), separator, ...body.map(render)].join("\n");
}

function blockMarkdown(node, indent = "") {
  if (!node) return "";
  const kids = childrenOf(node);

  switch (node.type) {
    case "doc":
      return kids
        .map((child) => blockMarkdown(child))
        .filter((s) => s !== "")
        .join("\n\n");

    case "paragraph":
      return inlineOf(node);

    case "heading":
      return "#".repeat(node.attrs?.level || 1) + " " + inlineOf(node);

    case "bulletList":
      return kids.map((item) => listItemMarkdown(item, "- ", indent)).join("\n");

    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return kids
        .map((item, i) => listItemMarkdown(item, start + i + ". ", indent))
        .join("\n");
    }

    case "taskList":
      return kids
        .map((item) =>
          listItemMarkdown(item, item.attrs?.checked ? "- [x] " : "- [ ] ", indent)
        )
        .join("\n");

    case "blockquote":
      return kids
        .map((child) => blockMarkdown(child, indent))
        .join("\n\n")
        .split("\n")
        .map((line) => "> " + line)
        .join("\n");

    case "codeBlock": {
      const language = node.attrs?.language || "";
      return "```" + language + "\n" + kids.map((c) => c.text || "").join("") + "\n```";
    }

    case "horizontalRule":
      return "---";

    case "table":
      return tableMarkdown(node);

    default:
      return kids.map((child) => blockMarkdown(child, indent)).join("\n\n");
  }
}

export function toMarkdown(doc) {
  if (!doc) return "";
  return blockMarkdown(doc);
}

// ---------------------------------------------------------------------------
// HTML — what the Word export carries
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

// Exported documents are opened by Word, Pages and Google Docs, so a note is
// not a place to let an arbitrary URL scheme through.
const SAFE_LINK = /^(https?:|mailto:|tel:)/i;

function styleAttr(declarations) {
  const style = declarations.filter(Boolean).join("; ");
  return style ? ` style="${escapeHtml(style)}"` : "";
}

function inlineHtml(node) {
  if (node?.type === "hardBreak") return "<br />";
  if (node?.type !== "text") return childrenOf(node).map(inlineHtml).join("");

  let out = escapeHtml(node.text || "");
  const marks = marksOf(node);
  const has = (type) => marks.some((m) => m.type === type);

  const textStyle = marks.find((m) => m.type === "textStyle");
  const highlight = marks.find((m) => m.type === "highlight");
  const spanStyle = styleAttr([
    textStyle?.attrs?.color ? `color: ${textStyle.attrs.color}` : "",
    textStyle?.attrs?.fontSize ? `font-size: ${textStyle.attrs.fontSize}` : "",
    highlight ? `background-color: ${highlight.attrs?.color || "#fef08a"}` : "",
  ]);
  if (spanStyle) out = `<span${spanStyle}>${out}</span>`;

  if (has("code")) out = `<code>${out}</code>`;
  if (has("bold")) out = `<strong>${out}</strong>`;
  if (has("italic")) out = `<em>${out}</em>`;
  if (has("underline")) out = `<u>${out}</u>`;
  if (has("strike")) out = `<s>${out}</s>`;

  const link = marks.find((m) => m.type === "link");
  if (link) {
    const href = link.attrs?.href || "";
    out = SAFE_LINK.test(href) ? `<a href="${escapeHtml(href)}">${out}</a>` : out;
  }
  return out;
}

function inlineHtmlOf(node) {
  return childrenOf(node).map(inlineHtml).join("");
}

const TABLE_CELL_STYLE = "border: 1px solid #cbd5e1; padding: 6px 8px";

function blockHtml(node) {
  if (!node) return "";
  const kids = childrenOf(node);
  const align = node.attrs?.textAlign;
  const alignStyle = styleAttr([align ? `text-align: ${align}` : ""]);

  switch (node.type) {
    case "doc":
      return kids.map(blockHtml).join("");

    case "paragraph":
      return `<p${alignStyle}>${inlineHtmlOf(node)}</p>`;

    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `<h${level}${alignStyle}>${inlineHtmlOf(node)}</h${level}>`;
    }

    case "bulletList":
      return `<ul>${kids.map(blockHtml).join("")}</ul>`;

    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      const startAttr = start === 1 ? "" : ` start="${start}"`;
      return `<ol${startAttr}>${kids.map(blockHtml).join("")}</ol>`;
    }

    // Word has no checkbox list, so the state is rendered as a glyph — which
    // survives copy/paste and printing intact.
    case "taskList":
      return `<ul style="list-style: none; padding-left: 1em">${kids
        .map(blockHtml)
        .join("")}</ul>`;

    case "taskItem":
      return `<li>${node.attrs?.checked ? "☑" : "☐"} ${kids.map(blockHtml).join("")}</li>`;

    case "listItem":
      return `<li>${kids.map(blockHtml).join("")}</li>`;

    case "blockquote":
      return `<blockquote style="border-left: 3px solid #cbd5e1; margin-left: 0; padding-left: 12px">${kids
        .map(blockHtml)
        .join("")}</blockquote>`;

    case "codeBlock":
      return `<pre><code>${escapeHtml(kids.map((c) => c.text || "").join(""))}</code></pre>`;

    case "horizontalRule":
      return "<hr />";

    case "table":
      return `<table border="1" cellspacing="0" cellpadding="0" style="border-collapse: collapse">${kids
        .map(blockHtml)
        .join("")}</table>`;

    case "tableRow":
      return `<tr>${kids.map(blockHtml).join("")}</tr>`;

    case "tableHeader":
      return `<th style="${TABLE_CELL_STYLE}; background-color: #f1f5f9">${kids
        .map(blockHtml)
        .join("")}</th>`;

    case "tableCell":
      return `<td style="${TABLE_CELL_STYLE}">${kids.map(blockHtml).join("")}</td>`;

    default:
      return kids.map(blockHtml).join("");
  }
}

export function toHtml(doc) {
  if (!doc) return "";
  return blockHtml(doc);
}
