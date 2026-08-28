import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMarkdown from "@site/src/components/AssistantMarkdown";
import { useSpeechInput } from "./useSpeechInput";
import { NorthwindAssistantMark } from "@site/src/components/NorthwindLogo";

function assistantApi(): string {
  // The course and storefront run on separate local ports in `npm run dev:all`.
  // Production uses the shared Northwind origin; never attempt a production
  // cross-origin call while a learner is running the workshop locally.
  return window.location.hostname === "localhost" ? "http://localhost:3002" : "https://northwind.mlynn.dev";
}

/**
 * Line art rather than the 🎙 emoji, which renders as a full-colour studio
 * microphone and sits at a completely different visual weight from everything
 * around it. Inherits `currentColor`, so it follows the button's own state.
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

type Chat = { role: "user" | "assistant"; text: string };

export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);
  // What the agent is doing while it is not yet saying anything. The first
  // turn is almost always a tool call, so without this the panel sits on
  // "Thinking…" through the part of the request that takes the longest.
  const [status, setStatus] = useState<string | null>(null);

  const session = useRef<Promise<unknown> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const voiceBase = useRef("");
  /**
   * Whether the transcript should follow new content.
   *
   * Tracked from the scroll event rather than measured in the effect: by the
   * time an effect runs React has already painted the new message, so
   * `scrollHeight` includes it and a "near the bottom" test computed there
   * concludes the reader had scrolled away — declining to scroll exactly when
   * something new arrived.
   */
  const stick = useRef(true);

  /**
   * Start the session once and KEEP the promise, so `send` can await the same
   * one. The message route answers 401 `session_required` without the cookie,
   * and the panel's suggested question is clickable immediately.
   */
  function ensureSession(): Promise<unknown> {
    session.current ??= fetch(`${assistantApi()}/api/assistant/session`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    return session.current;
  }

  useEffect(() => {
    // Session creation is an enhancement, not a prerequisite for reading a
    // lab. A local course server should remain usable when the companion shop
    // is not running.
    ensureSession();
  }, []);

  // Follow new content, unless the reader has deliberately scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat, status]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const onTranscript = useCallback((text: string) => setInput(voiceBase.current + text), []);
  const onVoiceStart = useCallback(() => {
    voiceBase.current = input.trim() ? `${input.trim()} ` : "";
  }, [input]);
  const voice = useSpeechInput({ onStart: onVoiceStart, onTranscript });

  async function send(text = input) {
    const message = text.trim();
    if (!message || busy) return;

    // Sending is an explicit request to see the bottom. Whatever the reader was
    // looking at before, they want their own question now.
    stick.current = true;
    setChat((items) => [...items, { role: "user", text: message }, { role: "assistant", text: "" }]);
    setInput("");
    if (box.current) box.current.style.height = "auto";
    setBusy(true);

    // Every exit path REPLACES the placeholder. An empty assistant bubble
    // renders as "Thinking…", so a failure that left one behind read as a
    // request still in flight — forever.
    const settle = (value: string) => {
      setStatus(null);
      setChat((items) => [...items.slice(0, -1), { role: "assistant", text: value }]);
    };

    const controller = new AbortController();
    abort.current = controller;
    let answer = "";

    try {
      await ensureSession();
      const response = await fetch(`${assistantApi()}/api/assistant/message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          surface: "course",
          context: { path: location.pathname, title: document.title, progress: [] },
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        settle(detail?.detail ?? detail?.error ?? `Ask Northwind is unavailable (HTTP ${response.status}).`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
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
        }
      }
      // A stream that closes having said nothing is still a failure.
      if (!answer) settle("The assistant returned no answer. Please try again.");
    } catch (error) {
      // Stopping is a choice, not a fault. Keep whatever had already arrived.
      if ((error as Error)?.name === "AbortError") settle(answer || "Stopped.");
      else settle("I can’t reach Ask Northwind right now.");
    } finally {
      setBusy(false);
      setStatus(null);
      abort.current = null;
    }
  }

  return (
    <div
      className={open ? "nw-assistant nw-assistant--open" : "nw-assistant"}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {open && (
        <div className="nw-assistant__panel">
          <header>
            <span className="nw-assistant__title">
              <NorthwindAssistantMark size={20} variant="inverted" />
              <strong>Ask Northwind</strong>
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <div
            className="nw-assistant__body"
            ref={scroller}
            // Re-evaluated on every scroll, including programmatic ones: after
            // an auto-scroll the reader is at the bottom, so this stays true.
            onScroll={(event) => {
              const el = event.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            aria-live="polite"
            aria-atomic="false"
          >
            {chat.length === 0 && (
              <>
                <p>I can explain this page, find the right next lab, or help with the fictional Northwind store.</p>
                <button onClick={() => send("What should I do next in the course?")}>What should I do next?</button>
              </>
            )}
            {chat.map((item, i) => (
              <div className={`nw-assistant__message nw-assistant__message--${item.role}`} key={i}>
                {item.role === "assistant" && (
                  <span className="nw-assistant__avatar" aria-hidden="true">
                    <NorthwindAssistantMark size={22} variant="theme" />
                  </span>
                )}
                {item.role === "assistant" ? (
                  item.text ? (
                    <AssistantMarkdown>{item.text}</AssistantMarkdown>
                  ) : (
                    <span className="nw-assistant__status">{status ?? "Thinking…"}</span>
                  )
                ) : (
                  item.text
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <textarea
              ref={box}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline. Skipped while an IME
                // is composing, or picking a candidate in Japanese or Chinese
                // would submit the half-finished word instead of accepting it.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={voice.listening ? "Listening…" : "Ask a question…  (Enter to send)"}
              maxLength={2000}
            />
            <div className="nw-assistant__controls">
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}>
                  Send
                </button>
              )}
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  aria-pressed={voice.listening}
                  aria-label={voice.listening ? "Stop dictating" : "Dictate a question"}
                  className={voice.listening ? "nw-assistant__mic nw-assistant__mic--on" : "nw-assistant__mic"}
                >
                  <MicIcon />
                  {voice.listening && <span>Listening</span>}
                </button>
              )}
              <a href="https://northwind.mlynn.dev/assistant">Open full page</a>
            </div>
          </form>
        </div>
      )}
      <button className="nw-assistant__launcher" onClick={() => setOpen(!open)}>
        {open ? (
          "Close"
        ) : (
          <>
            <NorthwindAssistantMark size={18} variant="inverted" />
            Ask Northwind
          </>
        )}
      </button>
    </div>
  );
}
