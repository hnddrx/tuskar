"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import ScopeBadge from "@/components/ScopeBadge";

const EMPTY = {
  title: "",
  eventDate: "",
  allDay: false,
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  description: "",
};

// Compose a calendar invite from scratch: pick when, who, and where, and it's
// saved to the calendar and turned into a downloadable/sendable .ics.
export default function EventFormModal({ open, onClose, defaultDate, onCreated }) {
  const { personal, team } = useTasks();
  const [form, setForm] = useState(EMPTY);
  const [scope, setScope] = useState("personal");
  const [memberIds, setMemberIds] = useState([]);
  const [guests, setGuests] = useState([]);
  const [guestDraft, setGuestDraft] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ ...EMPTY, eventDate: defaultDate || "" });
      setMemberIds([]);
      setGuests([]);
      setGuestDraft("");
      setError(null);
      setScope(team.orgId ? "team" : "personal");
    }
  }, [open, defaultDate, team.orgId]);

  if (!open) return null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleMember(id) {
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function addGuest() {
    const email = guestDraft.trim();
    if (!email) return;
    // Deliberately loose: enough to catch a typo'd address, not an attempt at
    // full RFC 5322 validation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(`"${email}" doesn't look like an email address.`);
      return;
    }
    if (!guests.some((g) => g.email === email)) {
      setGuests((g) => [...g, { name: email, email }]);
    }
    setGuestDraft("");
    setError(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the invite a title.");
    if (!form.eventDate) return setError("Pick a date.");
    if (!form.allDay && form.endTime && form.endTime <= form.startTime) {
      return setError("The end time has to be after the start time.");
    }

    const attendees = [
      ...team.members
        .filter((m) => memberIds.includes(m.id))
        .map((m) => ({ name: m.name, email: m.email })),
      ...guests,
    ].filter((a) => a.email);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      eventDate: form.eventDate,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay ? null : form.endTime,
      attendees,
    };

    const created =
      scope === "team" && team.orgId ? team.addEvent(payload) : personal.addEvent(payload);

    onCreated?.({ event: created, scope: scope === "team" && team.orgId ? "team" : "personal" });
    onClose();
  }

  const inputClass =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-900 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            New calendar invite
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {team.orgId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Save to
              </label>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                {["personal", "team"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      scope === s
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    <ScopeBadge scope={s} teamName={s === "team" ? team.orgName : null} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Title *
            </label>
            <input
              autoFocus
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Sprint planning"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Date *
              </label>
              <input
                type="date"
                required
                value={form.eventDate}
                onChange={(e) => set("eventDate", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Start
              </label>
              <input
                type="time"
                disabled={form.allDay}
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={`${inputClass} disabled:opacity-40`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                End
              </label>
              <input
                type="time"
                disabled={form.allDay}
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                className={`${inputClass} disabled:opacity-40`}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => set("allDay", e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            All day
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Location
            </label>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Meeting room, or a video call link"
              className={inputClass}
            />
          </div>

          {/* Attendees */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Attendees
            </label>

            {scope === "team" && team.members.length > 0 && (
              <div className="mb-2 max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 p-1.5 dark:border-slate-800">
                {team.members.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(m.id)}
                      onChange={() => toggleMember(m.id)}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                    <span className="truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={guestDraft}
                onChange={(e) => setGuestDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGuest();
                  }
                }}
                placeholder="Add anyone else by email"
                className={inputClass}
              />
              <button
                type="button"
                onClick={addGuest}
                className="shrink-0 rounded-md border border-slate-200 px-2.5 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Plus size={15} />
              </button>
            </div>

            {guests.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {guests.map((g) => (
                  <span
                    key={g.email}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {g.email}
                    <button
                      type="button"
                      onClick={() => setGuests((list) => list.filter((x) => x.email !== g.email))}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              Create invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
