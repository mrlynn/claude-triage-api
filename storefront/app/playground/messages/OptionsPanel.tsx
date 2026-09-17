"use client";

import type { ReactNode } from "react";
import { EXPLORER_MAX_TOKENS, EXPLORER_MODELS } from "@/lib/callLimits";
import { DEMO_TOOLS } from "@/lib/explorerTools";
import type { ExplorerOptions, Hint } from "@/lib/explorerPolicy";

/**
 * The request, as a form. Every control names the body path it writes, and hovering it lights that path up in the
 * Wire pane: the form is a way to edit the JSON, not a replacement for reading it.
 */

type Setter = <K extends keyof ExplorerOptions>(key: K, value: ExplorerOptions[K]) => void;

const input =
  "w-full rounded border border-pine/20 bg-white/70 px-2 py-1 text-[13px] text-pine focus:border-spruce focus:outline-none";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 border-t border-pine/10 pt-3 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-pine/50">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  path,
  label,
  onFocus,
  children,
  inline = false,
}: {
  path: string;
  label: string;
  onFocus: (path: string | null) => void;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label
      className={`block rounded px-1 py-0.5 hover:bg-spruce/10 ${inline ? "flex items-center justify-between gap-2" : ""}`}
      onMouseEnter={() => onFocus(path)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(path)}
    >
      <span className="flex items-baseline justify-between gap-2 text-[12px] text-pine/80">
        {label}
        {!inline && <code className="font-mono text-[10px] text-pine/40">{path}</code>}
      </span>
      <span className={inline ? "shrink-0" : "mt-0.5 block"}>{children}</span>
    </label>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (T | [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

const HINT_STYLE: Record<Hint["level"], string> = {
  error: "border-rose-300 bg-rose-50 text-rose-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-pine/15 bg-white/50 text-pine/75",
};

export default function OptionsPanel({
  options,
  set,
  onFocus,
  hints,
  schemaError,
}: {
  options: ExplorerOptions;
  set: Setter;
  onFocus: (path: string | null) => void;
  hints: Hint[];
  schemaError: string | null;
}) {
  const o = options;
  const setMessage = (i: number, patch: Partial<ExplorerOptions["messages"][number]>) =>
    set(
      "messages",
      o.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    );

  return (
    <div className="space-y-4 text-pine">
      <Group title="Model and limits">
        <Field path="model" label="model" onFocus={onFocus}>
          <Select value={o.model} options={EXPLORER_MODELS} onChange={(v) => set("model", v)} />
        </Field>
        <Field path="max_tokens" label={`max_tokens (≤ ${EXPLORER_MAX_TOKENS.toLocaleString("en-US")} here)`} onFocus={onFocus}>
          <input
            type="number"
            className={input}
            min={1}
            max={EXPLORER_MAX_TOKENS}
            value={o.maxTokens}
            onChange={(e) => set("maxTokens", Math.max(1, Math.min(EXPLORER_MAX_TOKENS, Number(e.target.value) || 1)))}
          />
        </Field>
        <Field path="stop_sequences" label="stop_sequences (comma separated)" onFocus={onFocus}>
          <input className={input} value={o.stopSequences} onChange={(e) => set("stopSequences", e.target.value)} />
        </Field>
      </Group>

      <Group title="Prompt">
        <Field path="system" label="system" onFocus={onFocus}>
          <textarea
            className={`${input} h-16 font-mono text-[12px]`}
            value={o.system}
            placeholder="(omitted)"
            onChange={(e) => set("system", e.target.value)}
          />
        </Field>
        <div className="space-y-2" onMouseEnter={() => onFocus("messages")} onMouseLeave={() => onFocus(null)}>
          <div className="flex items-baseline justify-between px-1 text-[12px] text-pine/80">
            messages
            <code className="font-mono text-[10px] text-pine/40">messages</code>
          </div>
          {o.messages.map((m, i) => (
            <div key={i} className="rounded border border-pine/15 bg-white/40 p-1.5">
              <div className="mb-1 flex items-center gap-2">
                <select
                  className="rounded border border-pine/20 bg-white/70 px-1 text-[11px]"
                  value={m.role}
                  onChange={(e) => setMessage(i, { role: e.target.value as "user" | "assistant" })}
                >
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
                <span className="font-mono text-[10px] text-pine/40">messages[{i}]</span>
                {o.messages.length > 1 && (
                  <button
                    type="button"
                    className="ml-auto text-[11px] text-pine/50 hover:text-rose-700"
                    onClick={() => set("messages", o.messages.filter((_, j) => j !== i))}
                  >
                    remove
                  </button>
                )}
              </div>
              {typeof m.content === "string" ? (
                <textarea
                  className={`${input} h-16`}
                  value={m.content}
                  onChange={(e) => setMessage(i, { content: e.target.value })}
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {m.content.map((b, j) => (
                    <span key={j} className="rounded bg-pine px-1.5 py-0.5 font-mono text-[10px] text-bone">
                      {String(b.type)}
                      {b.type === "tool_use" || b.type === "tool_result" ? ` · ${String(b.name ?? b.tool_use_id).slice(0, 18)}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2 px-1 text-[11px]">
            <button
              type="button"
              className="text-spruce hover:underline"
              onClick={() => set("messages", [...o.messages, { role: "user", content: "" }])}
            >
              + user
            </button>
            <button
              type="button"
              className="text-spruce hover:underline"
              onClick={() => set("messages", [...o.messages, { role: "assistant", content: "" }])}
            >
              + assistant
            </button>
          </div>
        </div>
      </Group>

      <Group title="Thinking and effort">
        <Field path="thinking" label="thinking.type" onFocus={onFocus}>
          <Select
            value={o.thinking}
            options={[
              ["omit", "(omitted)"],
              ["adaptive", "adaptive"],
              ["disabled", "disabled"],
              ["enabled", "enabled + budget_tokens (legacy)"],
            ]}
            onChange={(v) => set("thinking", v)}
          />
        </Field>
        {o.thinking === "enabled" ? (
          <Field path="thinking" label="thinking.budget_tokens" onFocus={onFocus}>
            <input
              type="number"
              className={input}
              value={o.budgetTokens}
              onChange={(e) => set("budgetTokens", Number(e.target.value) || 0)}
            />
          </Field>
        ) : (
          <Field path="thinking" label="thinking.display" onFocus={onFocus}>
            <Select
              value={o.display}
              options={[
                ["omit", "(omitted)"],
                ["summarized", "summarized"],
                ["omitted", "omitted"],
              ]}
              onChange={(v) => set("display", v)}
            />
          </Field>
        )}
        <Field path="output_config.effort" label="output_config.effort" onFocus={onFocus}>
          <Select
            value={o.effort}
            options={[["omit", "(omitted: high)"], "low", "medium", "high", "xhigh", "max"]}
            onChange={(v) => set("effort", v)}
          />
        </Field>
      </Group>

      <Group title="Tools">
        <Field path="tools" label="tools" onFocus={onFocus}>
          <div className="space-y-1">
            {DEMO_TOOLS.map((t) => (
              <span key={t.name} className="flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={o.tools.includes(t.name)}
                  onChange={(e) =>
                    set("tools", e.target.checked ? [...o.tools, t.name] : o.tools.filter((n) => n !== t.name))
                  }
                />
                <code className="font-mono">{t.name}</code>
              </span>
            ))}
          </div>
        </Field>
        <Field path="tool_choice" label="tool_choice" onFocus={onFocus}>
          <div className="flex gap-1">
            <Select
              value={o.toolChoice}
              options={[["omit", "(omitted: auto)"], "auto", "any", "none", ["tool", "tool (named)"]]}
              onChange={(v) => set("toolChoice", v)}
            />
            {o.toolChoice === "tool" && (
              <Select
                value={o.toolChoiceName}
                options={DEMO_TOOLS.map((t) => t.name)}
                onChange={(v) => set("toolChoiceName", v)}
              />
            )}
          </div>
        </Field>
        <Field path="tools" label="eager_input_streaming" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.eagerInput} onChange={(e) => set("eagerInput", e.target.checked)} />
        </Field>
      </Group>

      <Group title="Caching">
        <Field path="system" label="cache_control on system" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.cacheSystem} onChange={(e) => set("cacheSystem", e.target.checked)} />
        </Field>
        <Field path="tools" label="cache_control on last tool" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.cacheTools} onChange={(e) => set("cacheTools", e.target.checked)} />
        </Field>
        <Field path="cache_control" label="top-level cache_control (automatic)" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.autoCache} onChange={(e) => set("autoCache", e.target.checked)} />
        </Field>
      </Group>

      <Group title="Output and transport">
        <Field path="output_config.format" label="output_config.format (JSON schema)" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.schemaOn} onChange={(e) => set("schemaOn", e.target.checked)} />
        </Field>
        {o.schemaOn && (
          <textarea
            className={`${input} h-32 font-mono text-[11px]`}
            value={o.schema}
            onChange={(e) => set("schema", e.target.value)}
            onFocus={() => onFocus("output_config.format")}
          />
        )}
        {schemaError && <p className="text-[12px] text-rose-700">{schemaError}</p>}
        <Field path="stream" label="stream" onFocus={onFocus} inline>
          <input type="checkbox" checked={o.stream} onChange={(e) => set("stream", e.target.checked)} />
        </Field>
        <Field path="metadata" label="metadata.user_id" onFocus={onFocus}>
          <input className={input} value={o.userId} placeholder="(omitted)" onChange={(e) => set("userId", e.target.value)} />
        </Field>
      </Group>

      {hints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-pine/50">What the API will say</p>
          {hints.map((h, i) => (
            <p
              key={i}
              className={`rounded border px-2 py-1 text-[12px] leading-snug ${HINT_STYLE[h.level]}`}
              onMouseEnter={() => onFocus(h.path)}
              onMouseLeave={() => onFocus(null)}
            >
              <span className="font-semibold">{h.level === "error" ? "400 · " : h.level === "warn" ? "Heads up · " : ""}</span>
              {h.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
