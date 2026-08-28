import "server-only";
import { getDb, ensureIndexes } from "./mongo";
import type { Redaction } from "./untrusted";
import type { TriageResult } from "./triage";

/**
 * The escalation queue — the first real data in this app.
 *
 * Until now this storefront persisted exactly one thing: rate-limit counters.
 * A submitted ticket was classified and thrown away, which meant
 * `requires_human` was a field the schema produced and nothing acted on. A
 * flag nobody routes on is a comment.
 *
 * TWO DESIGN DECISIONS worth arguing with.
 *
 * **We store the REDACTED message, never the raw one.** `message_redacted` is
 * produced by `redactPII` before it is written, and the raw text is not kept
 * anywhere. That is not belt-and-braces on top of the boundary redaction in
 * Lab 8; it is the same decision applied one layer out. The moment you
 * persist, "the model was polite about the card number" stops being relevant
 * and the only question is what is in the database.
 *
 * **Documents expire after 30 days.** A public demo that accumulates the
 * public's support messages forever is a liability that grows on its own. The
 * TTL index means the retention policy is enforced by the database rather than
 * documented in a README nobody reads.
 *
 * WHAT THIS IS NOT: a ticketing system. There is no assignment, no threading,
 * no SLA timer, no audit log of who changed what. `docs/architecture.md` says
 * so explicitly under the omissions list, and the point of the queue is to
 * make `requires_human` mean something, not to build Zendesk.
 */

export type EscalationStatus = "new" | "claimed" | "resolved" | "dismissed";

/**
 * Which path produced a row.
 *
 * OPTIONAL RATHER THAN DEFAULTED, because rows written before the assistant
 * could file anything genuinely do not know, and back-filling them with
 * "form" would be inventing a fact to avoid a `?`. Absent reads as the form.
 */
export type EscalationSource = "form" | "assistant";

/**
 * What the assistant proposed and a customer confirmed.
 *
 * A queue row from the assistant carries this INSTEAD of a triage block, not
 * as well as one. No classifier ran on this path — the assistant investigated,
 * proposed, and a human agreed — and synthesising a `category` and a
 * `confidence` to fill the shape would put a number on the board that nothing
 * computed. An empty column is honest; a fabricated one is not.
 */
export interface AssistantTicket {
  proposalId: string;
  action: "refund" | "replacement" | "escalation";
  amountUsd?: number;
  /** The model's stated policy basis, redacted like any other stored text. */
  rationale: string;
}

export interface EscalationDoc {
  /** Human-quotable, e.g. NW-Q-4817. Shown to the customer on submit. */
  _id: string;
  created_at: Date;
  channel: string;
  /**
   * The message AFTER redaction. The raw text is never written. If you find
   * yourself wanting the original here, the thing you actually want is a
   * different redaction rule.
   */
  message_redacted: string;
  redactions: Redaction[];
  /** Present on form-submitted rows: the classification that routed it here. */
  triage?: TriageResult;
  source?: EscalationSource;
  /** Present on assistant-filed rows, in place of `triage`. */
  assistant?: AssistantTicket;
  status: EscalationStatus;
  claimed_by?: string;
  claimed_at?: Date;
  resolved_at?: Date;
  model: string;
  cost_usd: number;
}

const COLLECTION = "escalations";

/** Short, unambiguous, and not sequential — sequential ids leak volume. */
export function newTicketId(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `NW-Q-${n}`;
}

async function collection() {
  await ensureIndexes();
  const db = await getDb();
  return db.collection<EscalationDoc>(COLLECTION);
}

export async function insertEscalation(
  doc: Omit<EscalationDoc, "_id" | "created_at" | "status"> & { _id?: string },
): Promise<string> {
  const col = await collection();
  const _id = doc._id ?? newTicketId();
  await col.insertOne({
    ...doc,
    _id,
    created_at: new Date(),
    status: "new",
  });
  return _id;
}

export async function listEscalations(
  opts: { status?: EscalationStatus; limit?: number } = {},
): Promise<EscalationDoc[]> {
  const col = await collection();
  return col
    .find(opts.status ? { status: opts.status } : {})
    .sort({ created_at: -1 })
    .limit(Math.min(opts.limit ?? 100, 200))
    .toArray();
}

export async function setStatus(
  id: string,
  status: EscalationStatus,
  by?: string,
): Promise<boolean> {
  const col = await collection();
  const now = new Date();
  const set: Partial<EscalationDoc> = { status };
  if (status === "claimed") {
    set.claimed_by = by ?? "demo reviewer";
    set.claimed_at = now;
  }
  if (status === "resolved" || status === "dismissed") {
    set.resolved_at = now;
  }
  const res = await col.updateOne({ _id: id }, { $set: set });
  return res.matchedCount === 1;
}

/**
 * Empties the queue. For a facilitator running back-to-back sessions.
 *
 * This is the real need under "control the fictitious tickets": not
 * randomising the demo set — those seven are chosen, and they sit where two
 * handbook rules touch — but starting a session without yesterday's room's
 * submissions on the board.
 *
 * Deletes rather than archives. The rows are public support messages with a
 * 30-day TTL already on them; keeping a soft-deleted copy so a demo looks
 * tidy would defeat the retention policy it sits next to.
 */
export async function clearEscalations(): Promise<number> {
  const col = await collection();
  const res = await col.deleteMany({});
  return res.deletedCount ?? 0;
}

export interface QueueStats {
  depth: number;
  /**
   * Median seconds from arrival to claim, over claimed tickets. Median rather
   * than mean because one ticket left overnight would otherwise dominate the
   * figure and make a healthy queue look broken.
   */
  medianTimeToClaimSec: number | null;
  claimed: number;
  resolved: number;
}

export async function queueStats(): Promise<QueueStats> {
  const col = await collection();

  const [depth, claimed, resolved, claimedDocs] = await Promise.all([
    col.countDocuments({ status: "new" }),
    col.countDocuments({ status: "claimed" }),
    col.countDocuments({ status: "resolved" }),
    col
      .find(
        { claimed_at: { $exists: true } },
        { projection: { created_at: 1, claimed_at: 1 } },
      )
      .limit(500)
      .toArray(),
  ]);

  const deltas = claimedDocs
    .filter((d) => d.claimed_at)
    .map((d) => (d.claimed_at!.getTime() - d.created_at.getTime()) / 1000)
    .sort((a, b) => a - b);

  const median =
    deltas.length === 0
      ? null
      : deltas.length % 2 === 1
        ? deltas[(deltas.length - 1) / 2]!
        : (deltas[deltas.length / 2 - 1]! + deltas[deltas.length / 2]!) / 2;

  return { depth, claimed, resolved, medianTimeToClaimSec: median };
}
