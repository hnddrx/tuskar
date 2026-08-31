"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, RotateCcw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import NoActiveTeam from "@/components/NoActiveTeam";
import { useTasks } from "@/context/TaskContext";
import { PERMISSION_AREAS, DEFAULT_PERMISSIONS } from "@/lib/permissions";

// Who in this team may do what.
//
// Membership used to decide everything: anyone in a team could edit or delete
// anything in it. An admin sets each member's access here — one checkbox per
// thing they can do, grouped by the part of the app it affects.
//
// Admins are listed but not editable: their access comes from their Clerk
// role, so a checkbox here would be a lie. Saving is per member rather than
// one Save for the page, because a single button over everyone's checkboxes
// makes it far too easy to change someone's access by accident.

function sameSet(a, b) {
  return a.length === b.length && a.every((k) => b.includes(k));
}

export default function TeamAccessPage() {
  const { team } = useTasks();
  const { orgId, orgName } = team;

  const [state, setState] = useState({ members: [], canManage: false, me: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Unsaved edits, keyed by member id, so one row can be dirty or busy without
  // disturbing anyone else's.
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState({});

  // Fetched in the effect rather than through a callback the effect calls:
  // every setState here happens after an await, so switching teams cannot
  // cascade a render before the request has even gone out.
  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/team/permissions");
        if (cancelled) return;
        if (!res.ok) throw new Error("Couldn't load team access");
        const data = await res.json();
        if (cancelled) return;
        setState(data);
        setDraft({});
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const rows = useMemo(
    () =>
      state.members.map((m) => {
        const current = draft[m.id] ?? m.permissions;
        return { ...m, current, dirty: !sameSet(current, m.permissions) };
      }),
    [state.members, draft]
  );

  function toggle(memberId, key, on) {
    setDraft((d) => {
      const member = state.members.find((m) => m.id === memberId);
      const current = d[memberId] ?? member.permissions;
      const next = on ? [...new Set([...current, key])] : current.filter((k) => k !== key);
      return { ...d, [memberId]: next };
    });
  }

  function resetToDefaults(memberId) {
    setDraft((d) => ({ ...d, [memberId]: [...DEFAULT_PERMISSIONS] }));
  }

  async function save(member) {
    setBusy((b) => ({ ...b, [member.id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/team/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, permissions: member.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that");
      setState((s) => ({ ...s, members: data.members }));
      setDraft((d) => {
        const next = { ...d };
        delete next[member.id];
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[member.id];
        return next;
      });
    }
  }

  if (!orgId) return <NoActiveTeam title="Team access" />;

  return (
    <div className="flex-1">
      <PageHeader
        title="Team access"
        scope="team"
        teamName={orgName}
        subtitle={
          state.canManage
            ? "Choose what each member can do in this team. Changes apply as soon as you save them."
            : "What each member can do in this team. Only an admin can change this."
        }
      />

      <div className="px-4 py-6 sm:px-8">
        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nobody is in this team yet.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((member) => (
              <section
                key={member.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {member.name}
                      {member.isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                          <ShieldCheck size={10} /> Admin
                        </span>
                      )}
                      {!member.isAdmin && !member.configured && (
                        <span
                          title="Nobody has set this member's access, so the defaults apply."
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        >
                          Defaults
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {member.email || member.id}
                    </p>
                  </div>

                  {member.isAdmin ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Admins always have full access.
                    </p>
                  ) : (
                    state.canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => resetToDefaults(member.id)}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <RotateCcw size={12} /> Defaults
                        </button>
                        <button
                          type="button"
                          disabled={!member.dirty || busy[member.id]}
                          onClick={() => save(member)}
                          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                        >
                          {busy[member.id] && <Loader2 size={12} className="animate-spin" />}
                          {member.dirty ? "Save changes" : "Saved"}
                        </button>
                      </div>
                    )
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {PERMISSION_AREAS.map((area) => (
                    <div key={area.key}>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {area.label}
                      </p>
                      <div className="space-y-1">
                        {area.permissions.map((p) => (
                          <label
                            key={p.key}
                            title={p.hint}
                            className={`flex items-center gap-2 text-sm ${
                              member.isAdmin || !state.canManage
                                ? "cursor-default text-slate-400 dark:text-slate-500"
                                : "cursor-pointer text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={member.isAdmin || member.current.includes(p.key)}
                              disabled={member.isAdmin || !state.canManage}
                              onChange={(e) => toggle(member.id, p.key, e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700"
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
