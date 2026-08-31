"use client";

import { CreateOrganization } from "@clerk/nextjs";
import PageHeader from "@/components/PageHeader";

// Starting a new team.
//
// Creating one used to be possible only from inside Clerk's organization
// switcher, which is where you go to change teams rather than to make one —
// so the action was hidden behind a control with a different purpose, and
// someone in no teams at all had no obvious way to begin.
//
// Clerk's own screen does the work; this page gives it a home the All teams
// view can link to, alongside /team/manage and /team/access.
//
// `:id` is Clerk's own placeholder, filled in with the new organization once
// it exists, so creating a team lands you in it rather than back where you
// started wondering whether it worked.
export default function NewTeamPage() {
  return (
    <div className="flex-1">
      <PageHeader
        title="New team"
        subtitle="Create a team, then invite the people who work in it."
      />
      <div className="px-4 py-6 sm:px-8">
        <CreateOrganization
          routing="hash"
          afterCreateOrganizationUrl="/team/tasks?team=:id"
        />
      </div>
    </div>
  );
}
