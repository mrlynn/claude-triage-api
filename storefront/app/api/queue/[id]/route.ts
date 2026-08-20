import { NextResponse } from "next/server";
import { setStatus, type EscalationStatus } from "@/lib/models";
import { checkQueueAccess } from "@/lib/queueAuth";

/**
 * The reviewer queue, write side. Status transitions only.
 *
 * There is deliberately no endpoint for editing the message or the
 * classification. A reviewer's job here is to route work, not to revise the
 * record of what the customer said or what the model decided — and a queue
 * where both are editable stops being usable as evidence about either.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

const ALLOWED: EscalationStatus[] = ["new", "claimed", "resolved", "dismissed"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkQueueAccess(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, detail: "A valid queue token is required." },
      { status: auth.reason === "unconfigured" ? 503 : 401 },
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    by?: unknown;
  } | null;

  const status = body?.status;
  if (typeof status !== "string" || !ALLOWED.includes(status as EscalationStatus)) {
    return NextResponse.json(
      { error: "invalid_request", detail: `status must be one of ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }

  const by = typeof body?.by === "string" ? body.by.slice(0, 60) : undefined;
  const found = await setStatus(id, status as EscalationStatus, by);

  if (!found) {
    return NextResponse.json(
      { error: "not_found", detail: `No escalation with id ${id}.` },
      { status: 404 },
    );
  }

  return NextResponse.json({ id, status });
}
