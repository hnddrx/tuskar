import PageHeader from "@/components/PageHeader";

export default function NoActiveTeam({ title }) {
  return (
    <div className="flex-1">
      <PageHeader title={title} subtitle="No team is currently active." />
      <div className="px-4 py-6 sm:px-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Select or create a team using the switcher in the sidebar to see its tasks.
        </p>
      </div>
    </div>
  );
}
