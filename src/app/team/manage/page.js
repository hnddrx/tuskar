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
// This is a page rather than a modal, and not for want of trying. Clerk's
// openOrganizationProfile() discards a setActive applied moments before and
// snaps to whichever organization the session had persisted, so opening the
// modal for a team you had not already switched to reliably showed the wrong
// team's members. Measured, not assumed: setActive moved the active
// organization correctly every time, and opening the modal moved it back.
//
// Rendering OrganizationProfile inline on a page has no such behaviour: the
// team named in the URL is made active on arrival and the component follows
// it. New team is still a modal — CreateOrganization has nothing to snap to.
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
        <OrganizationProfile routing="hash" />
      </div>
    </div>
  );
}
