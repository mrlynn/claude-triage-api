"use client";

import type { Stage, StageId } from "./Pipeline";

/**
 * The animated companion to the stage checklist.
 *
 * Same data, different lesson: the checklist teaches *why* each stage exists,
 * this diagram shows the *shape* of the request — a message leaving the
 * browser, snaking through the guards, spending almost all of its life inside
 * the model call, and coming out the other end as a category. Packets flow
 * along whichever edge is currently carrying the data, so the long pause on
 * the Claude edge is visible rather than just printed as a number.
 *
 * Everything is driven by the same stage events the checklist consumes; the
 * diagram invents no state of its own.
 */

type NodeId = "source" | StageId | "sink";
type NodeStatus = "pending" | "running" | "done" | "failed";

interface NodeSpec {
  id: NodeId;
  label: string;
  glyph: string;
  x: number;
  y: number;
  r: number;
}

// Two rows, snaking: top row reads left-to-right, bottom row right-to-left.
const NODES: NodeSpec[] = [
  { id: "source", label: "Your message", glyph: "✉︎", x: 68, y: 48, r: 17 },
  { id: "validate", label: "Validate", glyph: "✓", x: 220, y: 48, r: 17 },
  { id: "ratelimit", label: "Rate limit", glyph: "$", x: 372, y: 48, r: 17 },
  { id: "prompt", label: "Prompt", glyph: "¶", x: 524, y: 48, r: 17 },
  { id: "schema", label: "Schema", glyph: "{ }", x: 524, y: 170, r: 17 },
  { id: "model", label: "Claude", glyph: "✳︎", x: 372, y: 170, r: 23 },
  { id: "parse", label: "Parse", glyph: "{✓}", x: 220, y: 170, r: 17 },
  // The terminal node's label is overridden at render time: a ticket that
  // needed a human did not end at "categorized", it ended in a queue, and a
  // diagram that says otherwise is telling the comfortable version.
  { id: "sink", label: "Categorized", glyph: "#", x: 68, y: 170, r: 17 },
];

function edgePath(a: NodeSpec, b: NodeSpec): string {
  if (a.y === b.y) {
    const dir = Math.sign(b.x - a.x);
    return `M ${a.x + dir * (a.r + 4)} ${a.y} L ${b.x - dir * (b.r + 8)} ${b.y}`;
  }
  // The turn at the right edge of the snake: out of the prompt node, around,
  // and into the schema node from the right.
  return `M ${a.x + a.r + 4} ${a.y} C ${a.x + 76} ${a.y}, ${b.x + 76} ${b.y}, ${b.x + b.r + 8} ${b.y}`;
}

const PINE = "var(--color-pine)";
const SPRUCE = "var(--color-spruce)";
const EMBER = "var(--color-ember)";
const FAIL = "#dc2626";

export default function FlowDiagram({
  stages,
  state,
  category,
  escalated,
}: {
  stages: Record<StageId, Stage>;
  state: "idle" | "sending" | "done" | "error";
  category?: string;
  /** True once the ticket has been queued for a human. */
  escalated?: boolean;
}) {
  const idle = state === "idle";

  function nodeStatus(id: NodeId): NodeStatus {
    if (id === "source") return idle ? "pending" : "done";
    if (id === "sink") {
      if (category) return "done";
      if (state === "error") return "failed";
      return "pending";
    }
    return stages[id].status;
  }

  // An edge is "done" once its downstream node finished, "active" while data
  // is on the wire toward it (downstream running, or downstream still pending
  // mid-request), and "failed" if the thing it feeds blew up.
  function edgeStatus(from: NodeId, to: NodeId): NodeStatus {
    const down = nodeStatus(to);
    const up = nodeStatus(from);
    if (down === "failed") return "failed";
    if (down === "done") return "done";
    if (down === "running") return "running";
    if (up === "done" && state === "sending") return "running";
    return "pending";
  }

  return (
    <figure className="min-w-0" aria-label="How a support ticket flows from the web page to a category">
      <svg viewBox="0 0 640 240" className="w-full" role="img">
        <defs>
          <marker id="fd-arrow-pending" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0.5 L 8 4 L 0 7.5 Z" fill={PINE} opacity="0.22" />
          </marker>
          <marker id="fd-arrow-live" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0.5 L 8 4 L 0 7.5 Z" fill={SPRUCE} />
          </marker>
          <marker id="fd-arrow-fail" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0.5 L 8 4 L 0 7.5 Z" fill={FAIL} />
          </marker>
        </defs>

        {NODES.slice(0, -1).map((from, i) => {
          const to = NODES[i + 1];
          const status = edgeStatus(from.id, to.id);
          const d = edgePath(from, to);
          const active = status === "running";

          const stroke =
            status === "failed" ? FAIL : status === "pending" ? PINE : SPRUCE;
          const marker =
            status === "failed"
              ? "url(#fd-arrow-fail)"
              : status === "pending"
                ? "url(#fd-arrow-pending)"
                : "url(#fd-arrow-live)";

          return (
            <g key={`${from.id}-${to.id}`}>
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeOpacity={status === "pending" ? (idle ? 0.3 : 0.18) : 1}
                strokeWidth={status === "pending" ? 1.5 : 2}
                strokeLinecap="round"
                strokeDasharray={active || (idle && status === "pending") ? "6 6" : undefined}
                markerEnd={marker}
                className={
                  active ? "nw-edge-active" : idle ? "nw-edge-ambient" : undefined
                }
              />
              {active &&
                [0, -0.45].map((begin) => (
                  <circle key={begin} r="3.5" fill={EMBER} className="nw-packet">
                    <animateMotion dur="0.9s" begin={`${begin}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))}
            </g>
          );
        })}

        {NODES.map((node) => {
          const status = nodeStatus(node.id);
          const isSink = node.id === "sink";
          // An escalated ticket did not end at "categorized" — it ended in a
          // queue, and the diagram should say so rather than showing the
          // comfortable version.
          const label = isSink
            ? escalated
              ? "Queued for a human"
              : (category ?? node.label)
            : node.label;

          const circleProps =
            status === "done"
              ? { fill: SPRUCE, stroke: SPRUCE }
              : status === "failed"
                ? { fill: FAIL, stroke: FAIL }
                : status === "running"
                  ? { fill: "white", stroke: SPRUCE, strokeWidth: 2.5 }
                  : { fill: "white", stroke: PINE, strokeOpacity: 0.25, strokeWidth: 1.5 };

          const glyphFill =
            status === "done" || status === "failed"
              ? "white"
              : status === "running"
                ? SPRUCE
                : PINE;

          return (
            <g key={node.id} opacity={idle && status === "pending" ? 0.55 : 1}>
              {status === "running" && (
                <circle cx={node.x} cy={node.y} r={node.r} fill="none" stroke={SPRUCE} strokeWidth="2" className="nw-node-pulse" />
              )}
              <circle cx={node.x} cy={node.y} r={node.r} {...circleProps} />
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={node.r > 20 ? 15 : 12}
                fontWeight={700}
                fill={glyphFill}
                fillOpacity={status === "pending" ? 0.45 : 1}
                style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
              >
                {status === "failed" ? "!" : node.glyph}
              </text>
              <text
                x={node.x}
                y={node.y + node.r + 15}
                textAnchor="middle"
                fontSize="11"
                fontWeight={status === "running" || (isSink && category) ? 700 : 500}
                fill={isSink && category ? SPRUCE : PINE}
                fillOpacity={status === "pending" && !idle ? 0.45 : isSink && category ? 1 : 0.75}
                className={isSink && category ? "nw-pop" : undefined}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        A support message travels from the web page through validation, a rate
        limit check, prompt assembly, and a schema constraint into a Claude
        call, whose response is parsed into a category.
      </figcaption>
    </figure>
  );
}
