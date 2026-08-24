"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import {
  generateTaskDoc,
  generateProjectDoc,
  downloadMarkdown,
} from "@/lib/docGenerator";
import PageHeader from "@/components/PageHeader";

const DOCS_FROM = new URLSearchParams({ from: "/docs", fromLabel: "Auto Docs" }).toString();

export default function DocsPage() {
  const { tasks, comments } = useTasks();
  const topLevel = useMemo(() => tasks.filter((t) => !t.parentId), [tasks]);
  const [previewId, setPreviewId] = useState(topLevel[0]?.id || null);

  const previewTask = tasks.find((t) => t.id === previewId);
  const previewDoc = previewTask
    ? generateTaskDoc(previewTask, comments, tasks)
    : "";

  function exportAll() {
    const doc = generateProjectDoc(tasks, comments);
    downloadMarkdown("taskar-project-documentation.md", doc);
  }

  function exportOne(task) {
    const doc = generateTaskDoc(task, comments, tasks);
    downloadMarkdown(`${task.ticketId.replace(/[^a-z0-9-]/gi, "_")}.md`, doc);
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Auto Docs"
        subtitle="Every task's description and comment/update history, compiled into readable documentation automatically — no manual write-up needed."
        actions={
          <button
            onClick={exportAll}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <FileDown size={16} /> Export full project doc
          </button>
        }
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 lg:order-1">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Tasks
            </p>
            <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5 lg:overflow-visible">
              {topLevel.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPreviewId(t.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm lg:w-full ${
                    previewId === t.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileText size={13} className="shrink-0" />
                  <span className="max-w-[10rem] truncate lg:max-w-none">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:order-2 lg:col-span-2">
            {previewTask ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Preview
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportOne(previewTask)}
                      className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <FileDown size={13} /> Export this doc
                    </button>
                    <Link
                      href={`/tasks/${previewTask.id}?${DOCS_FROM}`}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Open task
                    </Link>
                  </div>
                </div>
                <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                  {previewDoc}
                </pre>
              </>
            ) : (
              <p className="text-sm text-slate-400">No tasks yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
