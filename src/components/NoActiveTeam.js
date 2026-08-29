import PageHeader from "@/components/PageHeader";

export default function NoActiveTeam({ title }) {
  return (
    <div className="flex-1">
      <PageHeader title={title} subtitle="No team chosen." />
      <div className="px-4 py-6 sm:px-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Open a team under <span className="font-medium">Teams</span> in the sidebar to see
          its board, or create one with the switcher above it.
        </p>
      </div>
    </div>
  );
}
