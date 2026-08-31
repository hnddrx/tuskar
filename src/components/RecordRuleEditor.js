"use client";

import { Plus, X } from "lucide-react";
import {
  ME,
  RULE_FIELDS,
  RULE_OPERATORS,
  RULE_PRESETS,
  describeRules,
  ruleField,
} from "@/lib/recordRules";

// Builds one member's record rules — which team tasks they can see at all.
//
// Presets come first because they are what an admin almost always wants: the
// three named cases cover "their own work" and the two readings either side of
// it. Custom is there for the rest, and is only shown once chosen, so the
// common path is one dropdown rather than a form.
//
// The value control follows the field: a person field offers the team, a
// status field the team's own statuses, a date field a date picker. Typing a
// user id into a text box would be a rule that silently never matches.

const EVERY_TASK = "everyTask";
const CUSTOM = "custom";

function sameRules(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Which dropdown entry describes the rules as they stand. */
function presetKeyFor(rules) {
  if (!rules) return EVERY_TASK;
  const match = RULE_PRESETS.find((p) => sameRules(p.rules, rules));
  return match ? match.key : CUSTOM;
}

function choicesFor(fieldKey, config) {
  switch (fieldKey) {
    case "status":
      return config?.statuses || [];
    case "priority":
      return config?.priorities || [];
    case "type":
      return config?.types || [];
    default:
      return [];
  }
}

const SELECT_CLASS =
  "rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

function ValueControl({ condition, members, config, onChange }) {
  const field = ruleField(condition.field);
  if (!field || !RULE_OPERATORS[condition.operator]?.needsValue) return null;

  if (field.kind === "people" || field.kind === "person") {
    return (
      <select
        aria-label="Value"
        value={condition.value ?? ME}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {/* Named rather than shown as a placeholder: this is the option that
            makes one rule mean the right thing for whoever it is attached to. */}
        <option value={ME}>themselves</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    );
  }

  const choices = choicesFor(field.key, config);
  if (choices.length > 0) {
    return (
      <select
        aria-label="Value"
        value={condition.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Choose…</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      aria-label="Value"
      type={field.kind === "date" ? "date" : "text"}
      value={condition.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.kind === "date" ? undefined : "Value"}
      className={SELECT_CLASS}
    />
  );
}

export default function RecordRuleEditor({ value, onChange, members = [], config }) {
  const rules = value || null;
  const selected = presetKeyFor(rules);
  const conditions = rules?.conditions || [];

  function choosePreset(key) {
    if (key === EVERY_TASK) return onChange(null);
    if (key === CUSTOM) {
      // Starting from the current rules, or from one sensible row, so Custom
      // never opens onto an empty form that means "unrestricted".
      return onChange(
        rules || { match: "any", conditions: [{ field: "assignees", operator: "includes", value: ME }] }
      );
    }
    const preset = RULE_PRESETS.find((p) => p.key === key);
    return onChange(preset ? structuredClone(preset.rules) : null);
  }

  function patchCondition(index, patch) {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ match: rules.match, conditions: next });
  }

  function changeField(index, fieldKey) {
    const field = ruleField(fieldKey);
    if (!field) return;
    const operator = field.operators[0];
    // The old value rarely means anything under a new field — a user id under
    // "Status" would be a rule that never matches — so it is dropped.
    patchCondition(index, {
      field: fieldKey,
      operator,
      value: RULE_OPERATORS[operator].needsValue
        ? field.kind === "people" || field.kind === "person"
          ? ME
          : ""
        : undefined,
    });
  }

  function addCondition() {
    onChange({
      match: rules?.match || "any",
      conditions: [...conditions, { field: "status", operator: "is", value: "" }],
    });
  }

  function removeCondition(index) {
    const next = conditions.filter((_, i) => i !== index);
    // Removing the last row means "no restriction", not "see nothing".
    onChange(next.length ? { match: rules.match, conditions: next } : null);
  }

  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Can see
        </span>
        <select
          aria-label="Which tasks this member can see"
          value={selected}
          onChange={(e) => choosePreset(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value={EVERY_TASK}>Every task in the team</option>
          {RULE_PRESETS.map((p) => (
            <option key={p.key} value={p.key} title={p.hint}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {describeRules(rules, names)}
        </span>
      </div>

      {selected === CUSTOM && (
        <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/40">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            Task must match
            <select
              aria-label="Match all or any condition"
              value={rules?.match || "any"}
              onChange={(e) => onChange({ match: e.target.value, conditions })}
              className={SELECT_CLASS}
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
            of:
          </div>

          {conditions.map((condition, index) => {
            const field = ruleField(condition.field);
            return (
              <div key={index} className="flex flex-wrap items-center gap-1.5">
                <select
                  aria-label="Field"
                  value={condition.field}
                  onChange={(e) => changeField(index, e.target.value)}
                  className={SELECT_CLASS}
                >
                  {RULE_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Condition"
                  value={condition.operator}
                  onChange={(e) => {
                    const operator = e.target.value;
                    patchCondition(index, {
                      operator,
                      value: RULE_OPERATORS[operator].needsValue ? (condition.value ?? "") : undefined,
                    });
                  }}
                  className={SELECT_CLASS}
                >
                  {/* Only the operators this field takes — "before" on an
                      assignee list is not an option to get wrong. */}
                  {(field?.operators || []).map((op) => (
                    <option key={op} value={op}>
                      {RULE_OPERATORS[op].label}
                    </option>
                  ))}
                </select>

                <ValueControl
                  condition={condition}
                  members={members}
                  config={config}
                  onChange={(v) => patchCondition(index, { value: v })}
                />

                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  aria-label="Remove condition"
                  title="Remove condition"
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Plus size={12} /> Add condition
          </button>
        </div>
      )}
    </div>
  );
}
