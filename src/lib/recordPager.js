/**
 * Where a record sits in an ordered list, and what sits either side of it —
 * the Odoo-style "3 / 24  ‹ ›" pager on a record opened from a list.
 *
 * The pager walks the whole filtered result, not just the visible page: from
 * the record's point of view the list is one sequence, and stopping at a page
 * boundary would strand the reader mid-way through it.
 *
 * @param  {Array<{id: string}>} ordered the list exactly as it is rendered
 * @param  {string} recordId             the record on screen
 * @return {{index: number, total: number, prev: object|null, next: object|null} | null}
 *         null when the record isn't in the list at all (a stale link, or a
 *         record that no longer matches the filters it was opened under).
 */
export function pagerFor(ordered, recordId) {
  const index = ordered.findIndex((r) => r.id === recordId);
  if (index === -1) return null;
  return {
    index,
    total: ordered.length,
    prev: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}
