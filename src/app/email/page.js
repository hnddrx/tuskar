"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  ShieldCheck,
  Loader2,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useConfirm } from "@/components/ConfirmProvider";
import { SMTP_PRESETS, presetByKey, SECURITY_MODES } from "@/lib/smtp";

const SECURITY_LABELS = {
  none: "None (unencrypted)",
  starttls: "STARTTLS (usually port 587)",
  ssl: "SSL / TLS (usually port 465)",
};

const EMPTY_FORM = {
  label: "",
  host: "",
  port: 587,
  security: "starttls",
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
};

export default function EmailSettingsPage() {
  const confirm = useConfirm();

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preset, setPreset] = useState("custom");
  const [loading, setLoading] = useState(true);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  function loadConfig() {
    fetch("/api/email/config")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setForm({
          label: data.label || "",
          host: data.host || "",
          port: data.port || 587,
          security: data.security || "starttls",
          username: data.username || "",
          // Never populated from the server — an empty field means "keep the
          // stored password".
          password: "",
          fromName: data.fromName || "",
          fromEmail: data.fromEmail || "",
        });
        setPreset(SMTP_PRESETS.find((p) => p.host && p.host === data.host)?.key || "custom");
      })
      .catch(() => setSaveError("Couldn't load your mail settings."))
      .finally(() => setLoading(false));
  }

  useEffect(loadConfig, []);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
    setSaveError(null);
  }

  function applyPreset(key) {
    setPreset(key);
    const chosen = presetByKey(key);
    if (!chosen || key === "custom") return;
    setForm((f) => ({
      ...f,
      host: chosen.host,
      port: chosen.port,
      security: chosen.security,
      label: f.label || chosen.label,
    }));
    setTestResult(null);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ ok: false, error: err.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/email/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setStatus(data);
      setForm((f) => ({ ...f, password: "" }));
    } catch (err) {
      setSaveError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/email/send-test", { method: "POST" });
      const data = await res.json();
      setSendResult(res.ok ? data : { ok: false, error: data.error });
    } catch (err) {
      setSendResult({ ok: false, error: err.message || "Failed to send" });
    } finally {
      setSending(false);
    }
  }

  async function removeConfig() {
    const ok = await confirm({
      title: "Remove these mail settings?",
      message: "Taskar will stop sending email until a server is configured again.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/email/config", { method: "DELETE" });
    setForm(EMPTY_FORM);
    setPreset("custom");
    setTestResult(null);
    setSendResult(null);
    loadConfig();
  }

  const chosenPreset = presetByKey(preset);
  const canTest = Boolean(form.host && form.fromEmail);

  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-400 sm:px-8 dark:text-slate-500">Loading…</p>;
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Email Settings"
        subtitle="The outgoing mail server Taskar sends calendar invites through. Configured here — nothing to edit in your environment."
        actions={<ConnectionBadge status={status} />}
      />

      <div className="space-y-5 px-4 py-6 sm:px-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Mail size={15} /> Outgoing mail server
          </h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Provider
              </label>
              <select
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:focus:border-slate-500"
              >
                {SMTP_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              {chosenPreset?.hint && (
                <p className="mt-1.5 flex gap-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  {chosenPreset.hint}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  SMTP server
                </label>
                <input
                  value={form.host}
                  onChange={(e) => setField("host", e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Port
                </label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => setField("port", e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Connection security
              </label>
              <select
                value={form.security}
                onChange={(e) => setField("security", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:focus:border-slate-500"
              >
                {SECURITY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SECURITY_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Username
                </label>
                <input
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                  autoComplete="off"
                  placeholder="you@gmail.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={status?.hasPassword ? "•••••••• (unchanged)" : "App password"}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {status?.hasPassword
                    ? "Leave blank to keep the stored password."
                    : "Stored encrypted; never shown again after saving."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  From name
                </label>
                <input
                  value={form.fromName}
                  onChange={(e) => setField("fromName", e.target.value)}
                  placeholder="Taskar"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  From address
                </label>
                <input
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => setField("fromEmail", e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Most providers require this to match the account you sign in with.
                </p>
              </div>
            </div>
          </div>

          {testResult && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              )}
              <span>{testResult.ok ? testResult.message : testResult.error}</span>
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
              disabled={testing || !canTest}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Test connection
            </button>
            <button
              onClick={saveSettings}
              disabled={saving || !canTest}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save settings
            </button>
            {status?.configured && (
              <button
                onClick={removeConfig}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-slate-800 dark:bg-slate-900"
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Send size={15} /> Send a test email
          </h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Testing the connection proves the server accepted your login. This
            actually delivers a message — to your own account address, and
            nowhere else.
          </p>

          {sendResult && (
            <div
              className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                sendResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {sendResult.ok ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              )}
              <span>{sendResult.ok ? sendResult.message : sendResult.error}</span>
            </div>
          )}

          <button
            onClick={sendTest}
            disabled={sending || !status?.configured}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send test email
          </button>
        </section>
      </div>
    </div>
  );
}

function ConnectionBadge({ status }) {
  if (status?.configured) {
    return (
      <span
        title="A mail server is saved. Use Test connection to check it still works."
        className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <CheckCircle2 size={13} /> Configured
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <AlertTriangle size={13} /> Not configured
    </span>
  );
}
