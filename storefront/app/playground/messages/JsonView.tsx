"use client";

import { useState } from "react";

/**
 * JSON, one line per value, each line knowing its path in the object.
 *
 * The path is what lets hovering "effort" in the form light up `output_config.effort` in the body. A syntax
 * highlighter would colour the tokens but could not say which option a line came from.
 */

interface Line {
  indent: number;
  path: string;
  key?: string;
  text: string;
  kind: "string" | "number" | "boolean" | "null" | "punct";
  long?: { full: string };
}

const SHORT = 180;

function build(value: unknown, path: string, indent: number, key: string | undefined, comma: boolean, out: Line[]) {
  const tail = comma ? "," : "";
  if (Array.isArray(value) || (value && typeof value === "object")) {
    const isArray = Array.isArray(value);
    const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value);
    const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
    if (!entries.length) {
      out.push({ indent, path, key, text: `${open}${close}${tail}`, kind: "punct" });
      return;
    }
    out.push({ indent, path, key, text: open, kind: "punct" });
    entries.forEach(([k, v], i) => {
      const child = isArray ? `${path}[${k}]` : path ? `${path}.${k}` : k;
      build(v, child, indent + 1, isArray ? undefined : k, i < entries.length - 1, out);
    });
    out.push({ indent, path, text: `${close}${tail}`, kind: "punct" });
    return;
  }
  const json = JSON.stringify(value) ?? "undefined";
  const kind = value === null ? "null" : typeof value === "string" ? "string" : typeof value === "number" ? "number" : "boolean";
  if (kind === "string" && json.length > SHORT) {
    out.push({ indent, path, key, text: tail, kind, long: { full: json } });
    return;
  }
  out.push({ indent, path, key, text: `${json}${tail}`, kind });
}

const KIND_CLASS: Record<Line["kind"], string> = {
  string: "text-emerald-300",
  number: "text-amber-300",
  boolean: "text-sky-300",
  null: "text-bone/50",
  punct: "text-bone/70",
};

export function matches(path: string, focus: string | null): boolean {
  if (!focus) return false;
  return path === focus || path.startsWith(`${focus}.`) || path.startsWith(`${focus}[`);
}

export default function JsonView({
  value,
  focus = null,
  className = "",
}: {
  value: unknown;
  focus?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const lines: Line[] = [];
  build(value, "", 0, undefined, false, lines);

  return (
    <pre className={`overflow-x-auto font-mono text-[12px] leading-[1.55] text-bone ${className}`}>
      {lines.map((line, i) => {
        const lit = matches(line.path, focus);
        const expanded = line.long && open.has(line.path);
        return (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all pr-2 ${lit ? "bg-ember/25 shadow-[inset_3px_0_0_#d9642a]" : ""}`}
            style={{ paddingLeft: `${line.indent * 14 + 8}px` }}
          >
            {line.key !== undefined && <span className="text-sky-200">&quot;{line.key}&quot;</span>}
            {line.key !== undefined && <span className="text-bone/60">: </span>}
            {line.long ? (
              <>
                <span className={KIND_CLASS.string}>
                  {expanded ? line.long.full : `${line.long.full.slice(0, SHORT)}…"`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(line.path)) next.delete(line.path);
                      else next.add(line.path);
                      return next;
                    })
                  }
                  className="ml-2 rounded bg-bone/10 px-1.5 text-[10px] text-bone/70 hover:bg-bone/20"
                >
                  {expanded ? "collapse" : `+${(line.long.full.length - SHORT).toLocaleString("en-US")} chars`}
                </button>
                <span className="text-bone/70">{line.text}</span>
              </>
            ) : (
              <span className={KIND_CLASS[line.kind]}>{line.text}</span>
            )}
          </div>
        );
      })}
    </pre>
  );
}
