"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssistantMarkdown from "@/components/AssistantMarkdown";
import { useSpeechInput } from "./useSpeechInput";

/**
 * Line art rather than the 🎙 emoji, which renders as a full-colour studio
 * microphone on most platforms and sits at a completely different visual
 * weight from everything around it. This inherits `currentColor`, so it picks
 * up the button's own state styling instead of fighting it.
 */
function MicIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

type Message = { role: "user" | "assistant"; text: string };
type Proposal = { id: string; action: string; amountUsd?: number; rationale: string; expiresInSeconds: number };
type Props = { fullPage?: boolean; initialProduct?: string; initialOrderId?: string };

function courseProgress(): string[] {
  try {
    return JSON.parse(localStorage.getItem("northwind-mission-progress") ?? "{}").completed ?? [];
  } catch {
    return [];
  }
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

  const suggestions = useMemo(
    () =>
      initialProduct
        ? ["What is the return policy?", `Help with ${initialProduct}`]
        : ["Where should I start?", "Explain this demo", "I need help with an order"],
    [initialProduct],
  );

  const session = useRef<Promise<unknown> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const voiceBase = useRef("");
  /**
   * Whether the transcript should follow new content.
   *
   * Tracked from the scroll event rather than measured in the effect, because
   * by the time an effect runs React has already painted the new message — so
   * `scrollHeight` includes it, the distance to the bottom looks huge, and a
   * "am I near the bottom" test computed there concludes the reader had
   * scrolled away. That is backwards: it declines to scroll exactly when
   * something new has arrived. This ref answers the question from the last
   * position the reader actually chose.
   */
  const stick = useRef(true);

  /**
   * Start the session once and KEEP the promise, so `send` can await the same
   * one. The message route answers 401 `session_required` without the cookie,
   * and nothing else stops a visitor clicking a suggested question before the
   * fire-and-forget request below has come back.
   */
  function ensureSession(): Promise<unknown> {
    session.current ??= fetch("/api/assistant/session", { method: "POST", credentials: "include" }).catch(
      () => undefined,
    );
    return session.current;
  }

  useEffect(() => {
    // The dock must never make the shop fail to render when the optional
    // assistant runtime has not been configured locally.
    ensureSession();
  }, []);

  // Follow new content, unless the reader has deliberately scrolled up to
  // re-read something — in which case they are not dragged back down.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, proposal]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const onTranscript = useCallback((text: string) => setInput(voiceBase.current + text), []);
  const onVoiceStart = useCallback(() => {
    // Dictation appends to whatever is already typed rather than replacing it.
    voiceBase.current = input.trim() ? `${input.trim()} ` : "";
  }, [input]);
  const voice = useSpeechInput({ onStart: onVoiceStart, onTranscript });

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function send(value = input) {
    const message = value.trim();
    if (!message || pending) return;

    // Sending is an explicit request to see the bottom. Whatever the reader was
    // looking at before, they want their own question now.
    stick.current = true;
    setMessages((prior) => [...prior, { role: "user", text: message }, { role: "assistant", text: "" }]);
    setInput("");
    if (box.current) box.current.style.height = "auto";
    setPending(true);

    // Every exit path REPLACES the placeholder rather than appending after it.
    // An empty assistant bubble renders as "Thinking…", so a failure that left
    // one behind read as a request still in flight — forever. Settling also
    // clears the tool status: once there are words in the bubble, "Finding the
    // right lab…" is describing something that already happened.
    const settle = (text: string) => {
      setStatus(null);
      setMessages((prior) => [...prior.slice(0, -1), { role: "assistant", text }]);
    };

    const controller = new AbortController();
    abort.current = controller;
    let answer = "";

    try {
      await ensureSession();
      const response = await fetch("/api/assistant/message", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          surface: "storefront",
          context: {
            path: location.pathname,
            title: document.title,
            product: initialProduct,
            orderId: initialOrderId,
            progress: courseProgress(),
          },
        }),
      });

      if (!response.ok || !response.body) {
        // Name the failure. A rate limit, an unconfigured deployment and a
        // missing route are different problems, and none of them is
        // diagnosable from a bubble that just sits there.
        const detail = await response.json().catch(() => null);
        settle(detail?.detail ?? detail?.error ?? `The assistant is unavailable (HTTP ${response.status}).`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const raw = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!raw) continue;
          const event = JSON.parse(raw);
          if (event.type === "text") {
            answer += event.text;
            settle(answer);
          }
          if (event.type === "tool") setStatus(event.label);
          if (event.type === "error") {
            answer ||= event.detail ?? "The assistant could not complete that request.";
            settle(answer);
          }
          if (event.type === "proposal") setProposal(event.proposal);
        }
      }
      // A stream that closes having said nothing is still a failure.
      if (!answer) settle("The assistant returned no answer. Please try again.");
    } catch (error) {
      // Stopping is a choice, not a fault. Keep whatever had already arrived.
      if ((error as Error)?.name === "AbortError") settle(answer || "Stopped.");
      else settle("I can’t reach the assistant right now. Please try again shortly.");
    } finally {
      setPending(false);
      setStatus(null);
      abort.current = null;
    }
  }

  async function confirm() {
    if (!proposal) return;
    const response = await fetch("/api/assistant/actions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id }),
    });
    const data = await response.json().catch(() => null);
    const text = response.ok
      ? `Filed as ticket **${data?.ticket}**. It is on the [support queue](/queue) for a human to action — nothing has been issued automatically.`
      : data?.error === "rate_limited"
        ? "Too many requests from your connection just now. Try confirming again in a minute."
        : "That proposal is no longer available.";
    setMessages((prior) => [...prior, { role: "assistant", text }]);
    setProposal(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-pine px-5 py-3 text-sm font-semibold text-bone shadow-xl hover:bg-spruce"
      >
        Ask Northwind
      </button>
    );
  }

  return (
    <section
      onKeyDown={(event) => {
        if (event.key === "Escape" && !fullPage) setOpen(false);
      }}
      className={
        fullPage
          ? "mx-auto max-w-3xl"
          : "fixed bottom-5 right-5 z-50 flex h-[min(620px,calc(100vh-2.5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-pine/20 bg-bone shadow-2xl"
      }
      aria-label="Ask Northwind assistant"
    >
      <header className="flex items-center justify-between bg-pine px-4 py-3 text-bone">
        <div>
          <strong>Ask Northwind</strong>
          <p className="text-xs text-bone/70">Workshop guide · fictional support</p>
        </div>
        {!fullPage && (
          <button onClick={() => setOpen(false)} aria-label="Close assistant">
            ×
          </button>
        )}
      </header>

      <div
        ref={scroller}
        // Re-evaluated on every scroll, including the programmatic ones: after
        // an auto-scroll the reader is at the bottom, so this stays true and
        // the transcript keeps following. Scrolling up sets it false and the
        // following stops until they come back down.
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        // Announced politely so a screen reader hears the answer arrive rather
        // than being interrupted on every streamed token.
        aria-live="polite"
        aria-atomic="false"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <>
            <p className="text-sm text-pine/75">
              I can guide you through the workshop or help with a Northwind order. I’ll show my sources and ask
              before any simulated action.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  onClick={() => send(item)}
                  className="rounded border border-pine/20 px-2 py-1 text-xs hover:border-spruce"
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-8 rounded-lg bg-pine p-3 text-sm text-bone"
                : "mr-5 rounded-lg border border-pine/15 bg-white/50 p-3 text-sm text-pine"
            }
          >
            {message.role === "assistant" ? (
              message.text ? (
                <AssistantMarkdown>{message.text}</AssistantMarkdown>
              ) : (
                <span className="opacity-70">{status ?? "Thinking…"}</span>
              )
            ) : (
              message.text
            )}
          </div>
        ))}

        {proposal && (
          <div className="rounded-lg border border-ember/50 bg-ember/10 p-3 text-sm">
            <strong>Confirm simulated {proposal.action}</strong>
            <p className="mt-1">{proposal.rationale}</p>
            <button onClick={confirm} className="mt-2 rounded bg-pine px-3 py-1.5 text-bone">
              Confirm
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="border-t border-pine/15 p-3"
      >
        <textarea
          ref={box}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            grow(event.target);
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. Skipped while an IME is
            // composing, or picking a candidate in Japanese or Chinese would
            // submit the half-finished word instead of accepting it.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
          maxLength={2000}
          rows={1}
          placeholder={voice.listening ? "Listening…" : "Ask a question…  (Enter to send)"}
          className="w-full resize-none rounded border border-pine/25 bg-white/60 p-2 text-sm"
        />
        <div className="mt-2 flex items-center gap-2">
          {pending ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="rounded border border-pine/30 px-3 py-1.5 text-sm text-pine hover:border-ember"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded bg-pine px-3 py-1.5 text-sm text-bone disabled:opacity-40"
            >
              Send
            </button>
          )}

          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Stop dictating" : "Dictate a question"}
              title={voice.listening ? "Stop dictating" : "Dictate a question"}
              className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-sm ${
                voice.listening
                  ? "border-ember bg-ember/15 text-ember"
                  : "border-pine/25 text-pine hover:border-spruce"
              }`}
            >
              <MicIcon />
              {voice.listening && <span className="text-xs">Listening</span>}
            </button>
          )}

          {!fullPage && (
            <Link href="/assistant" className="ml-auto text-xs underline">
              Open full page
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
