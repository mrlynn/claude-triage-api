import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMarkdown from "@site/src/components/AssistantMarkdown";
import { useSpeechInput } from "./useSpeechInput";

function assistantApi(): string {
  // The course and storefront run on separate local ports in `npm run dev:all`.
  // Production uses the shared Northwind origin; never attempt a production
  // cross-origin call while a learner is running the workshop locally.
  return window.location.hostname === "localhost" ? "http://localhost:3002" : "https://northwind.mlynn.dev";
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

  // Follow the answer as it streams, unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
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
            <strong>Ask Northwind</strong>
            <button onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <div className="nw-assistant__body" ref={scroller} aria-live="polite" aria-atomic="false">
            {chat.length === 0 && (
              <>
                <p>I can explain this page, find the right next lab, or help with the fictional Northwind store.</p>
                <button onClick={() => send("What should I do next in the course?")}>What should I do next?</button>
              </>
            )}
            {chat.map((item, i) => (
              <div className={`nw-assistant__message nw-assistant__message--${item.role}`} key={i}>
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
                  {voice.listening ? "● Listening" : "🎙"}
                </button>
              )}
              <a href="https://northwind.mlynn.dev/assistant">Open full page</a>
            </div>
          </form>
        </div>
      )}
      <button className="nw-assistant__launcher" onClick={() => setOpen(!open)}>
        {open ? "Close" : "Ask Northwind"}
      </button>
    </div>
  );
}
