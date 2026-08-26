"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  ArrowDownToLine,
  ChevronDown,
  Loader2,
  Info,
} from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import PageHeader from "@/components/PageHeader";
import { JIRA_SETTINGS_KEY } from "@/lib/constants";

const EMPTY_FORM = {
  baseUrl: "",
  email: "",
  apiToken: "",
  project: "",
  jql: "",
  startDateFieldId: "",
  githubBranchFieldId: "",
};

const DEFAULT_LOCAL_PREFS = {
  autoImport: false,
  intervalMinutes: 15,
  lastImportSummary: null,
  lastImportAt: null,
};

export default function JiraPage() {
  const { mergeJiraIssues } = useTasks();
  const { userId, orgId } = useAuth();

  const [status, setStatus] = useState(null); // GET /api/jira/config result
  const [form, setForm] = useState(EMPTY_FORM);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);

  const [prefs, setPrefs] = useState(DEFAULT_LOCAL_PREFS);
  const timerRef = useRef(null);
  const lastUserIdRef = useRef(undefined);

  function loadConfig() {
    return fetch("/api/jira/config")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setForm((f) => ({
          ...f,
          baseUrl: data.baseUrl || "",
          email: data.email || "",
          project: data.project || "",
          jql: data.jql || "",
          startDateFieldId: data.startDateFieldId || "",
          githubBranchFieldId: data.githubBranchFieldId || "",
          apiToken: "",
        }));
      })
      .catch(() => setStatus({ configured: false }));
  }

  // Load server-side connection status/settings, plus this browser's local
  // (non-secret) import preferences. Re-runs on account switch so a
  // previous account's Jira connection never lingers on screen.
  useEffect(() => {
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId) {
      setStatus(null);
      setForm(EMPTY_FORM);
    }
    lastUserIdRef.current = userId;

    loadConfig();
    try {
      const raw = window.localStorage.getItem(JIRA_SETTINGS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch {
      // ignore
    }
  }, [userId]);

  function persistPrefs(next) {
    setPrefs(next);
    try {
      window.localStorage.setItem(JIRA_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
  }

  const dirty =
    status &&
    (form.baseUrl !== (status.baseUrl || "") ||
      form.email !== (status.email || "") ||
      form.project !== (status.project || "") ||
      form.jql !== (status.jql || "") ||
      form.startDateFieldId !== (status.startDateFieldId || "") ||
      form.githubBranchFieldId !== (status.githubBranchFieldId || "") ||
      form.apiToken !== "");

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const usingUnsavedToken = form.apiToken.trim().length > 0;
      const res = await fetch("/api/jira/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usingUnsavedToken || dirty
            ? {
                baseUrl: form.baseUrl,
                email: form.email,
                apiToken: form.apiToken || undefined,
              }
            : {}
        ),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/jira/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      setStatus(data);
      setForm((f) => ({ ...f, apiToken: "" }));
      setTestResult(null);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/jira/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const { created, updated } = mergeJiraIssues(data.issues);
      persistPrefs({
        ...prefs,
        lastImportSummary: `${created} new, ${updated} updated, ${data.count} total from Jira`,
        lastImportAt: data.fetchedAt,
      });
    } catch (err) {
      setImportError(err.message);
      persistPrefs({ ...prefs, lastImportSummary: `Error: ${err.message}`, lastImportAt: new Date().toISOString() });
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (prefs.autoImport && status?.configured) {
      timerRef.current = setInterval(runImport, Math.max(1, prefs.intervalMinutes) * 60 * 1000);
    }
    return () => timerRef.current && clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.autoImport, prefs.intervalMinutes, status?.configured]);

  if (orgId) {
    return (
      <div className="flex-1">
        <PageHeader
          title="Jira Import"
          subtitle="Jira import is only available in your personal space."
        />
        <div className="px-4 py-6 sm:px-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Switch to your Personal Account to configure or run a Jira import.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Jira Import"
        subtitle="Pull issues from Jira into Taskar. Nothing here ever writes back to Jira."
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <Info size={17} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">How this works</p>
            <p className="mt-1 text-blue-800 dark:text-blue-300">
              Direction is <strong>Jira → Taskar only</strong>. Clicking
              &quot;Import from Jira&quot; fetches issues matching your JQL,
              creates any that are new here, and refreshes the fields on ones
              you&apos;ve already imported (matched by Ticket ID). Editing a
              task in Taskar never changes anything in Jira — tasks you
              created by hand are never touched by an import.
            </p>
          </div>
        </div>

        {/* Connection settings */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <ShieldCheck size={15} /> Connection settings
            </h2>
            <ConnectionBadge status={status} />
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Jira Base URL
              </label>
              <input
                value={form.baseUrl}
                onChange={(e) => setField("baseUrl", e.target.value)}
                placeholder="https://your-domain.atlassian.net"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Email / username
                </label>
                <input
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  API token
                </label>
                <input
                  type="password"
                  value={form.apiToken}
                  onChange={(e) => setField("apiToken", e.target.value)}
                  placeholder={status?.hasToken ? "•••••••• (saved — leave blank to keep)" : "Paste your API token"}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Jira Project (key)
              </label>
              <input
                value={form.project}
                onChange={(e) => setField("project", e.target.value)}
                placeholder="OB2B"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Used to build the default import query — every issue in this
                project, newest first. Set a custom JQL below to narrow it
                down.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronDown
                size={13}
                className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
              Advanced
            </button>

            {advancedOpen && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Custom JQL (overrides Project above)
                  </label>
                  <input
                    value={form.jql}
                    onChange={(e) => setField("jql", e.target.value)}
                    placeholder={`project = "${form.project || "OB2B"}" ORDER BY updated DESC`}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Start Date field ID
                    </label>
                    <input
                      value={form.startDateFieldId}
                      onChange={(e) => setField("startDateFieldId", e.target.value)}
                      placeholder="customfield_10015"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      GitHub Branch field ID
                    </label>
                    <input
                      value={form.githubBranchFieldId}
                      onChange={(e) => setField("githubBranchFieldId", e.target.value)}
                      placeholder="customfield_10099"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {testResult && (
            <div
              className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {testResult.ok
                ? `Connected as ${testResult.account?.name} (${testResult.account?.email})`
                : testResult.error}
            </div>
          )}
          {saveError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              onClick={testConnection}
              disabled={testing || !form.baseUrl || !form.email}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Test connection
            </button>
            <button
              onClick={saveSettings}
              disabled={saving || !dirty || !form.baseUrl || !form.email}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save settings
            </button>
            {status?.source === "env" && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Currently using JIRA_* environment variables — saving here
                switches to UI-managed settings.
              </span>
            )}
          </div>
        </section>

        {/* Import */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <ArrowDownToLine size={15} /> Import from Jira
            </h2>
          </div>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Jira <span className="mx-1">→</span> Taskar, one direction only.
          </p>

          <button
            onClick={runImport}
            disabled={importing || !status?.configured}
            className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors dark:bg-slate-100 dark:text-slate-900"
          >
            <RefreshCw size={15} className={importing ? "animate-spin" : ""} />
            {importing ? "Importing…" : "Import from Jira now"}
          </button>
          {!status?.configured && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Save valid connection settings above to enable importing.
            </p>
          )}

          {importError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {importError}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/60">
            <p className="text-slate-500 dark:text-slate-400">Last import result</p>
            <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
              {prefs.lastImportSummary || "Never imported yet"}
            </p>
            {prefs.lastImportAt && (
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {new Date(prefs.lastImportAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Auto-import while this tab is open
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Browser tabs can&apos;t run on a schedule in the background —
                for always-on imports, point a Vercel Cron Job at{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                  POST /api/jira/import
                </code>
                .
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={prefs.autoImport}
                onChange={(e) => persistPrefs({ ...prefs, autoImport: e.target.checked })}
              />
              Every
              <input
                type="number"
                min={1}
                value={prefs.intervalMinutes}
                onChange={(e) =>
                  persistPrefs({ ...prefs, intervalMinutes: Number(e.target.value) || 15 })
                }
                className="w-14 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:focus:border-slate-500"
              />
              min
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

function ConnectionBadge({ status }) {
  if (!status) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">Checking…</span>;
  }
  if (status.configured) {
    return (
      <span
        title="Base URL, email, and an API token are saved. Use Test connection to verify they actually work."
        className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <CheckCircle2 size={13} /> Configured
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      <XCircle size={13} /> Not configured
    </span>
  );
}
