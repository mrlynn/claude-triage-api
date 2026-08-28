import { useEffect, useRef, useState } from "react";

function assistantApi(): string {
  // The course and storefront run on separate local ports in `npm run dev:all`.
  // Production uses the shared Northwind origin; never attempt a production
  // cross-origin call while a learner is running the workshop locally.
  return window.location.hostname === "localhost"
    ? "http://localhost:3002"
    : "https://northwind.mlynn.dev";
}
type Chat = { role: "user" | "assistant"; text: string };

export default function AssistantDock() {
  const [open, setOpen] = useState(false); const [input, setInput] = useState(""); const [chat, setChat] = useState<Chat[]>([]); const [busy, setBusy] = useState(false);
  const session = useRef<Promise<unknown> | null>(null);

  /**
   * Start the session once and KEEP the promise.
   *
   * The message route answers 401 `session_required` without the cookie, and
   * the effect below does not block the first click — so a learner who clicks
   * the suggested question immediately used to race the session into a 401.
   * Awaiting the same promise in `send` closes that window without making the
   * dock wait on the network before it will render.
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
    // lab. A local course server should remain usable when its companion shop
    // or private agent runtime is not running.
    ensureSession();
  }, []);

  async function send(text = input) {
    if (!text.trim() || busy) return;
    setChat((items) => [...items, { role: "user", text }, { role: "assistant", text: "" }]);
    setInput(""); setBusy(true);
    // Every exit path REPLACES the placeholder. An empty assistant bubble
    // renders as "Thinking…", so any path that leaves one behind is a spinner
    // that never resolves — which is what a failed request used to look like.
    const settle = (message: string) => setChat((items) => [...items.slice(0, -1), { role: "assistant", text: message }]);
    try {
      await ensureSession();
      const response = await fetch(`${assistantApi()}/api/assistant/message`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, surface: "course", context: { path: location.pathname, title: document.title, progress: [] } }) });
      if (!response.ok || !response.body) {
        // Say WHICH failure it is. A storefront without the assistant routes
        // deployed (404) and a storefront that cannot reach the agent runtime
        // (503) are different problems with the same symptom, and neither is
        // diagnosable from a bubble that just sits there.
        const detail = await response.json().catch(() => null);
        settle(detail?.detail ?? detail?.error ?? `Ask Northwind is unavailable (HTTP ${response.status}).`);
        return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split("\n\n"); buffer = frames.pop() ?? ""; for (const frame of frames) { const raw = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6); if (!raw) continue; const event = JSON.parse(raw); if (event.type === "text") { answer += event.text; settle(answer); } if (event.type === "error") { answer ||= event.detail ?? "The assistant could not complete that request."; settle(answer); } } }
      // A stream that closes having said nothing is still a failure.
      if (!answer) settle("The assistant returned no answer. Please try again.");
    } catch { settle("I can’t reach Ask Northwind right now."); } finally { setBusy(false); }
  }
  return <div className={open ? "nw-assistant nw-assistant--open" : "nw-assistant"}>{open && <div className="nw-assistant__panel"><header><strong>Ask Northwind</strong><button onClick={() => setOpen(false)} aria-label="Close">×</button></header><div className="nw-assistant__body">{chat.length === 0 && <><p>I can explain this page, find the right next lab, or help with the fictional Northwind store.</p><button onClick={() => send("What should I do next in the course?")}>What should I do next?</button></>}{chat.map((item, i) => <p className={`nw-assistant__message nw-assistant__message--${item.role}`} key={i}>{item.text || "Thinking…"}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question…" maxLength={2000}/><button disabled={busy || !input.trim()}>{busy ? "Thinking…" : "Send"}</button><a href="https://northwind.mlynn.dev/assistant">Open full page</a></form></div>}<button className="nw-assistant__launcher" onClick={() => setOpen(!open)}>{open ? "Close" : "Ask Northwind"}</button></div>;
}
