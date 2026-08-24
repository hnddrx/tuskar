"use client";

import { useTasks } from "@/context/TaskContext";
import ConfigListEditor from "@/components/ConfigListEditor";
import PageHeader from "@/components/PageHeader";

export default function ConfigPage() {
  const { config, updateConfig, resetToSeed } = useTasks();

  return (
    <div className="flex-1">
      <PageHeader
        title="Configuration"
        subtitle="These lists power every dropdown in the app — statuses, priorities, task types, and assignees."
        actions={
          <button
            onClick={() => {
              if (
                confirm(
                  "Reset all tasks, comments, and configuration back to the original imported data? This cannot be undone."
                )
              ) {
                resetToSeed();
              }
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Reset to imported data
          </button>
        }
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ConfigListEditor
            title="Statuses"
            hint="Also defines the Board's columns, in order."
            items={config.statuses}
            onChange={(v) => updateConfig("statuses", v)}
          />
          <ConfigListEditor
            title="Priorities"
            items={config.priorities}
            onChange={(v) => updateConfig("priorities", v)}
          />
          <ConfigListEditor
            title="Task types"
            items={config.types}
            onChange={(v) => updateConfig("types", v)}
          />
          <ConfigListEditor
            title="Assignees"
            items={config.assignees}
            onChange={(v) => updateConfig("assignees", v)}
          />
        </div>
      </div>
    </div>
  );
}
