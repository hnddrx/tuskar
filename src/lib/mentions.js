// @-mentions in team comments.
//
// A comment is stored as the text the user actually typed ("Hey @Wren Macayan
// look"), with the mentioned member ids alongside it. Names are therefore
// resolved twice — once on save, to know who to notify, and once on render,
// to highlight them — which is why both live here as pure functions rather
// than inside the component.

// Names can contain spaces, so a mention has to be allowed to span them; but
// letting it run forever would treat a whole sentence as one query. Real names
// are rarely more than this many words.
const MAX_MENTION_WORDS = 4;

/**
 * The mention being typed immediately before the caret, or null.
 *
 * @return {{query: string, start: number} | null} `start` is the index of the @
 */
export function activeMentionQuery(text, caret) {
  const upto = String(text || "").slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;

  // An @ inside a word is an email address, not a mention.
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;

  const query = upto.slice(at + 1);

  // Punctuation ends a mention; a name would not contain it.
  if (/[,.;:!?@\n]/.test(query)) return null;
  if (query.trim().split(/\s+/).filter(Boolean).length > MAX_MENTION_WORDS) return null;

  return { query, start: at };
}

export function matchMembers(members, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [...(members || [])];
  return (members || []).filter((m) =>
    String(m.name || "").toLowerCase().includes(needle)
  );
}

/** Replaces the typed query with the member's full name. */
export function insertMention(text, caret, start, member) {
  const before = String(text || "").slice(0, start);
  const after = String(text || "").slice(caret);
  const inserted = `@${member.name} `;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

// Longest names first, so "Sam" cannot swallow a mention of "Sam Rivera".
function byNameLengthDesc(members) {
  return [...(members || [])].sort(
    (a, b) => String(b.name || "").length - String(a.name || "").length
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Who a comment mentions.
 *
 * Derived from the same single pass the renderer uses, rather than testing
 * each member separately: "@Sam" also matches inside "@Sam Rivera", so
 * independent tests would notify the wrong person as well as the right one.
 */
export function findMentionedIds(text, members) {
  const found = [];
  for (const segment of splitMentions(text, members)) {
    if (segment.type !== "mention" || !segment.id) continue;
    if (!found.includes(segment.id)) found.push(segment.id);
  }
  return found;
}

/**
 * Splits a comment into plain and mention segments for rendering, so a
 * mention can be highlighted without the component doing string surgery.
 */
export function splitMentions(text, members) {
  const body = String(text || "");
  if (!body) return [];

  const ordered = byNameLengthDesc(members).filter((m) => m.name);
  if (ordered.length === 0) return [{ type: "text", value: body }];

  const pattern = new RegExp(
    ordered.map((m) => `@${escapeRegExp(m.name)}\\b`).join("|"),
    "g"
  );

  const segments = [];
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: body.slice(cursor, match.index) });
    }
    const name = match[0].slice(1);
    const member = ordered.find((m) => m.name === name);
    segments.push({ type: "mention", value: match[0], id: member?.id ?? null });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    segments.push({ type: "text", value: body.slice(cursor) });
  }
  return segments;
}
