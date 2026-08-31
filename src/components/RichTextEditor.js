"use client";

import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  Highlighter,
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  IndentIncrease,
  IndentDecrease,
  Table as TableIcon,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  PanelTop,
  Trash2,
  Undo2,
  Redo2,
  Palette,
} from "lucide-react";

import { EMPTY_DOC } from "@/lib/richText";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px"];

const COLORS = [
  { label: "Default", value: null },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
];

function extensions(placeholder) {
  return [
    Placeholder.configure({ placeholder: placeholder || "" }),
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color,
    FontSize,
  ];
}

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      // Keeps the document selection while the button is clicked; without it
      // the editor loses focus and the command applies to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={Boolean(active)}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />;
}

// A labelled run of table buttons that stays on one line.
//
// Insert-above and insert-left read clearly enough as arrows, but the two
// delete buttons are the same glyph — only the label says which one takes a
// row and which a column. So the label has to stay with its buttons: the
// toolbar wraps, and a group broken across lines put "delete row" at the
// start of a line directly before the COL label, where it read as a column
// control. Grouping them in one non-shrinking flex row moves the whole group
// to the next line together, or none of it.
function TableGroup({ label, children }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <span className="select-none px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      {children}
    </span>
  );
}

/**
 * The note body editor. `value` is a Tiptap/ProseMirror document; it seeds the
 * editor and is deliberately not re-applied on every keystroke — remount with
 * a `key` to load a different note, which avoids fighting the cursor.
 *
 * `onReady` hands the editor instance back so the caller can drive it (the
 * note editor uses it to insert dictated text at the cursor).
 */
export default function RichTextEditor({ value, onChange, onReady, placeholder }) {
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: value || EMPTY_DOC,
    // Required under the App Router: rendering once on the server and again on
    // the client from the same call produces a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "taskar-prose min-h-[22rem] focus:outline-none",
      },
    },
    onCreate: ({ editor: instance }) => onReady?.(instance),
    onUpdate: ({ editor: instance }) => onChange?.(instance.getJSON()),
  });

  // Selecting only the flags the toolbar draws keeps typing from re-rendering
  // every button on every keystroke.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            taskList: e.isActive("taskList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            highlight: e.isActive("highlight"),
            link: e.isActive("link"),
            alignLeft: e.isActive({ textAlign: "left" }),
            alignCenter: e.isActive({ textAlign: "center" }),
            alignRight: e.isActive({ textAlign: "right" }),
            inTable: e.isActive("table"),
            canAddRowBefore: e.isActive("table") && e.can().addRowBefore(),
            canAddRowAfter: e.isActive("table") && e.can().addRowAfter(),
            canDeleteRow: e.isActive("table") && e.can().deleteRow(),
            canAddColumnBefore: e.isActive("table") && e.can().addColumnBefore(),
            canAddColumnAfter: e.isActive("table") && e.can().addColumnAfter(),
            canDeleteColumn: e.isActive("table") && e.can().deleteColumn(),
            canToggleHeaderRow: e.isActive("table") && e.can().toggleHeaderRow(),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
            fontSize: e.getAttributes("textStyle")?.fontSize || "",
          }
        : null,
  });

  if (!editor) {
    return (
      <div className="min-h-[24rem] animate-pulse rounded-md bg-slate-50 dark:bg-slate-800/40" />
    );
  }

  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = editor.getAttributes("link")?.href || "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    chain().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 overflow-x-auto rounded-md border border-slate-200 bg-white/95 px-1 py-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <ToolbarButton title="Bold" active={state?.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={state?.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={state?.underline}
          onClick={() => chain().toggleUnderline().run()}
        >
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={state?.strike}
          onClick={() => chain().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Heading 1"
          active={state?.h1}
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={state?.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Bulleted list"
          active={state?.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={state?.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Checklist"
          active={state?.taskList}
          onClick={() => chain().toggleTaskList().run()}
        >
          <ListChecks size={14} />
        </ToolbarButton>
        <ToolbarButton title="Indent" onClick={() => chain().sinkListItem("listItem").run()}>
          <IndentIncrease size={14} />
        </ToolbarButton>
        <ToolbarButton title="Outdent" onClick={() => chain().liftListItem("listItem").run()}>
          <IndentDecrease size={14} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Quote"
          active={state?.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={state?.codeBlock}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          <Code2 size={14} />
        </ToolbarButton>
        <ToolbarButton title="Divider" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Highlight"
          active={state?.highlight}
          onClick={() => chain().toggleHighlight().run()}
        >
          <Highlighter size={14} />
        </ToolbarButton>
        <ToolbarButton title="Link" active={state?.link} onClick={setLink}>
          <Link2 size={14} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Align left"
          active={state?.alignLeft}
          onClick={() => chain().setTextAlign("left").run()}
        >
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align centre"
          active={state?.alignCenter}
          onClick={() => chain().setTextAlign("center").run()}
        >
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={state?.alignRight}
          onClick={() => chain().setTextAlign("right").run()}
        >
          <AlignRight size={14} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Insert table"
          active={state?.inTable}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={14} />
        </ToolbarButton>
        {state?.inTable && (
          <>
            <TableGroup label="Row">
              <ToolbarButton
                title="Insert row above"
                disabled={!state?.canAddRowBefore}
                onClick={() => chain().addRowBefore().run()}
              >
                <BetweenHorizontalStart size={14} />
              </ToolbarButton>
              <ToolbarButton
                title="Insert row below"
                disabled={!state?.canAddRowAfter}
                onClick={() => chain().addRowAfter().run()}
              >
                <BetweenHorizontalEnd size={14} />
              </ToolbarButton>
              <ToolbarButton
                title="Delete row"
                disabled={!state?.canDeleteRow}
                onClick={() => chain().deleteRow().run()}
              >
                <Minus size={14} />
              </ToolbarButton>
            </TableGroup>

            <TableGroup label="Col">
              <ToolbarButton
                title="Insert column left"
                disabled={!state?.canAddColumnBefore}
                onClick={() => chain().addColumnBefore().run()}
              >
                <BetweenVerticalStart size={14} />
              </ToolbarButton>
              <ToolbarButton
                title="Insert column right"
                disabled={!state?.canAddColumnAfter}
                onClick={() => chain().addColumnAfter().run()}
              >
                <BetweenVerticalEnd size={14} />
              </ToolbarButton>
              <ToolbarButton
                title="Delete column"
                disabled={!state?.canDeleteColumn}
                onClick={() => chain().deleteColumn().run()}
              >
                <Minus size={14} />
              </ToolbarButton>
            </TableGroup>

            <ToolbarButton
              title="Toggle header row"
              disabled={!state?.canToggleHeaderRow}
              onClick={() => chain().toggleHeaderRow().run()}
            >
              <PanelTop size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Delete table"
              onClick={() => chain().deleteTable().run()}
            >
              <Trash2 size={14} />
            </ToolbarButton>
          </>
        )}

        <Divider />

        <select
          value={state?.fontSize || ""}
          onChange={(e) =>
            e.target.value
              ? chain().setFontSize(e.target.value).run()
              : chain().unsetFontSize().run()
          }
          title="Font size"
          aria-label="Font size"
          className="h-7 shrink-0 rounded border border-slate-200 bg-transparent px-1 text-xs text-slate-500 transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:text-slate-400"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size.replace("px", "")}
            </option>
          ))}
        </select>

        <span className="flex shrink-0 items-center gap-0.5">
          <Palette size={13} className="text-slate-400 dark:text-slate-500" />
          {COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                c.value ? chain().setColor(c.value).run() : chain().unsetColor().run()
              }
              title={c.label}
              aria-label={`Text colour: ${c.label}`}
              className="h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
              style={{ backgroundColor: c.value || "transparent" }}
            />
          ))}
        </span>

        <Divider />

        <ToolbarButton
          title="Undo"
          disabled={!state?.canUndo}
          onClick={() => chain().undo().run()}
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={!state?.canRedo}
          onClick={() => chain().redo().run()}
        >
          <Redo2 size={14} />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
