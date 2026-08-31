// Making a whole row open the record it stands for.
//
// Rows used to be openable only by their name link or an Edit button, which
// meant most of a wide table row was dead space — you aimed at a few
// characters of text to open something the whole row represents.
//
// Three things must still work once the row itself is clickable:
//
//   - The controls inside it. A row's Edit and Archive buttons, its links and
//     its inputs have to keep doing their own job rather than also opening the
//     record behind them. Rather than ask every button to stop propagation and
//     hope none is ever forgotten, the row asks whether the click landed on
//     something interactive and stands aside if it did.
//   - Selecting text. Dragging across a row to copy a ticket id ends in a
//     click, and that must not navigate.
//   - Modified clicks. Ctrl, meta, shift and middle-click mean "open
//     elsewhere" on a real link; a row is not one, so it leaves them alone
//     rather than doing something the reader did not ask for.

/** Elements that handle their own clicks and must not be overridden. */
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button']";

/**
 * The decision itself, kept away from the DOM so it can be reasoned about and
 * tested directly.
 */
export function shouldOpenRow({ interactive = false, selecting = false, modified = false } = {}) {
  return !interactive && !selecting && !modified;
}

function hasSelection() {
  try {
    return Boolean(window.getSelection()?.toString());
  } catch {
    // Some browsers throw on a detached document; no selection is the safe read.
    return false;
  }
}

function isModified(event) {
  return Boolean(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
}

/**
 * Props to spread onto a row so the whole of it opens `open()`.
 *
 * `label` names the record for anyone not looking at the screen, since a
 * clickable row has no text of its own to announce.
 */
export function rowOpenProps(open, label) {
  return {
    role: "link",
    tabIndex: 0,
    "aria-label": label,
    onClick: (event) => {
      const interactive = Boolean(event.target.closest?.(INTERACTIVE));
      if (!shouldOpenRow({ interactive, selecting: hasSelection(), modified: isModified(event) })) {
        return;
      }
      open();
    },
    onKeyDown: (event) => {
      // Enter only. Space scrolls the page, and a row that swallowed it would
      // break the one key every reader uses to move down a long table.
      if (event.key !== "Enter") return;
      if (event.target.closest?.(INTERACTIVE)) return;
      event.preventDefault();
      open();
    },
  };
}
