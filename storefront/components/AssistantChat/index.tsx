"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AssistantMarkdown from "@/components/AssistantMarkdown";

type Message = { role: "user" | "assistant"; text: string };
type Proposal = { id: string; action: string; amountUsd?: number; rationale: string; expiresInSeconds: number };
type Props = { fullPage?: boolean; initialProduct?: string; initialOrderId?: string };

function courseProgress(): string[] {
  try { return JSON.parse(localStorage.getItem("northwind-mission-progress") ?? "{}").completed ?? []; } catch { return []; }
}

export default function AssistantChat({ fullPage = false, initialProduct, initialOrderId }: Props) {
  const [open, setOpen] = useState(fullPage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // What the agent is doing while it is not yet saying anything. The first
  // turn is almost always a tool call, so without this the panel sits on
  // "Thinking…" through the part of the request that takes the longest.
  const [status, setStatus] = useState<string | null>(null);
  const suggestions = useMemo(() => initialProduct ? ["What is the return policy?", `Help with ${initialProduct}`] : ["Where should I start?", "Explain this demo", "I need help with an order"], [initialProduct]);

  const session = useRef<Promise<unknown> | null>(null);

  /**
   * Start the session once and KEEP the promise, so `send` can await the same
   * one. The message route answers 401 `session_required` without the cookie,
   * and nothing else stops a visitor clicking a suggested question before the
   * fire-and-forget request below has come back.
   */
  function ensureSession(): Promise<unknown> {
    session.current ??= fetch("/api/assistant/session", { method: "POST", credentials: "include" }).catch(() => undefined);
    return session.current;
  }

  useEffect(() => {
    // The dock must never make the shop fail to render when the optional
    // assistant runtime has not been configured locally.
    ensureSession();
  }, []);

  async function send(value = input) {
    const message = value.trim(); if (!message || pending) return;
    setMessages((prior) => [...prior, { role: "user", text: message }, { role: "assistant", text: "" }]); setInput(""); setPending(true);
    // Every exit path REPLACES the placeholder rather than appending after it.
    // An empty assistant bubble renders as "Thinking…", so a failure that left
    // one behind read as a request still in flight — forever.
    // Settling also clears the tool status: once there are words in the bubble,
    // "Finding the right lab…" is describing something that already happened.
    const settle = (text: string) => { setStatus(null); setMessages((prior) => [...prior.slice(0, -1), { role: "assistant", text }]); };
    try {
      await ensureSession();
      const response = await fetch("/api/assistant/message", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, surface: "storefront", context: { path: location.pathname, title: document.title, product: initialProduct, orderId: initialOrderId, progress: courseProgress() } }) });
      if (!response.ok || !response.body) {
        // Name the failure. `assistant_unavailable` (the runtime is unreachable)
        // and a 404 (these routes are not deployed) are different problems, and
        // neither is diagnosable from a bubble that just sits there.
        const detail = await response.json().catch(() => null);
        settle(detail?.detail ?? detail?.error ?? `The assistant is unavailable (HTTP ${response.status}).`);
        return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) { const raw = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6); if (!raw) continue; const event = JSON.parse(raw); if (event.type === "text") { answer += event.text; settle(answer); } if (event.type === "tool") setStatus(event.label); if (event.type === "error") { answer ||= event.detail ?? "The assistant could not complete that request."; settle(answer); } if (event.type === "proposal") setProposal(event.proposal); }
      }
      // A stream that closes having said nothing is still a failure.
      if (!answer) settle("The assistant returned no answer. Please try again.");
    } catch { settle("I can’t reach the assistant right now. Please try again shortly."); }
    finally { setPending(false); setStatus(null); }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-50 rounded-full bg-pine px-5 py-3 text-sm font-semibold text-bone shadow-xl hover:bg-spruce">Ask Northwind</button>;
  return <section className={fullPage ? "mx-auto max-w-3xl" : "fixed bottom-5 right-5 z-50 flex h-[min(620px,calc(100vh-2.5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-pine/20 bg-bone shadow-2xl"} aria-label="Ask Northwind assistant">
    <header className="flex items-center justify-between bg-pine px-4 py-3 text-bone"><div><strong>Ask Northwind</strong><p className="text-xs text-bone/70">Workshop guide · fictional support</p></div>{!fullPage && <button onClick={() => setOpen(false)} aria-label="Close assistant">×</button>}</header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <><p className="text-sm text-pine/75">I can guide you through the workshop or help with a Northwind order. I’ll show my sources and ask before any simulated action.</p><div className="flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} onClick={() => send(item)} className="rounded border border-pine/20 px-2 py-1 text-xs hover:border-spruce">{item}</button>)}</div></>}{messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-8 rounded-lg bg-pine p-3 text-sm text-bone" : "mr-5 rounded-lg border border-pine/15 bg-white/50 p-3 text-sm text-pine"}>{message.role === "assistant" ? (message.text ? <AssistantMarkdown>{message.text}</AssistantMarkdown> : <span className="opacity-70">{status ?? "Thinking…"}</span>) : message.text}</div>)}{proposal && <div className="rounded-lg border border-ember/50 bg-ember/10 p-3 text-sm"><strong>Confirm simulated {proposal.action}</strong><p className="mt-1">{proposal.rationale}</p><button onClick={async () => { const r = await fetch("/api/assistant/actions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId: proposal.id }) }); setMessages((prior) => [...prior, { role: "assistant", text: r.ok ? "Confirmed and recorded in the fictional support ledger." : "That proposal is no longer available." }]); setProposal(null); }} className="mt-2 rounded bg-pine px-3 py-1.5 text-bone">Confirm</button></div>}</div>
    <form onSubmit={(event) => { event.preventDefault(); send(); }} className="border-t border-pine/15 p-3"><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={2} placeholder="Ask a question…" className="w-full resize-none rounded border border-pine/25 bg-white/60 p-2 text-sm"/><button disabled={pending || !input.trim()} className="mt-2 rounded bg-pine px-3 py-1.5 text-sm text-bone disabled:opacity-40">{pending ? "Thinking…" : "Send"}</button>{!fullPage && <Link href="/assistant" className="ml-3 text-xs underline">Open full page</Link>}</form>
  </section>;
}
