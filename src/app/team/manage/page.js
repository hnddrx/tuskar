"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { OrganizationProfile, useOrganizationList } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";
import NoActiveTeam from "@/components/NoActiveTeam";
import { useTasks } from "@/context/TaskContext";
import { TEAM_PARAM, resolveTeamScope } from "@/lib/teamScope";

// Managing a team — members, invitations, roles, the organization's own name.
//
// Clerk's own screen does all of that, and this page exists to give it a home
// per team. Clerk's OrganizationSwitcher offers "Manage organization" for the
// active organization only, and the component takes no prop to offer it for
// the others, so the sidebar links here once per team instead: every team you
// are in gets its own way in, without switching first and coming back.
//
// OrganizationProfile still renders whichever organization is active, so the
// team named in the URL is made active on arrival. The sidebar link already
// does this on its way out; doing it here too means a bookmarked or shared
// link lands on the right team rather than on whichever was last selected.
export default function TeamManagePage() {
  return (
    <Suspense fallback={null}>
      <TeamManageInner />
    </Suspense>
  );
}

function TeamManageInner() {
  const searchParams = useSearchParams();
  const {
    team: { orgs, orgId, orgName },
  } = useTasks();
  const { isLoaded, setActive } = useOrganizationList();

  // Only a team this person is actually in — a stale or invented id in the
  // URL falls back to whatever is selected rather than being obeyed.
  const wanted = resolveTeamScope(searchParams.get(TEAM_PARAM), orgs);

  useEffect(() => {
    if (!wanted || !isLoaded || !setActive || wanted === orgId) return;
    Promise.resolve(setActive({ organization: wanted })).catch(() => {});
  }, [wanted, isLoaded, setActive, orgId]);

  if (!orgId && !wanted) return <NoActiveTeam title="Manage team" />;

  const showing = orgs?.find((o) => o.id === (wanted || orgId));

  return (
    <div className="flex-1">
      <PageHeader
        title="Manage team"
        scope="team"
        teamName={showing?.name || orgName}
        subtitle="Members, invitations and roles for this team."
      />
      <div className="px-4 py-6 sm:px-8">
        {/* Clerk renders the active organization. While a switch is settling,
            this briefly shows the previous team rather than nothing at all. */}
        <OrganizationProfile routing="hash" />
      </div>
    </div>
  );
}
