import { useEffect, useState } from "react";

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
  useEffect(() => {
    // Session creation is an enhancement, not a prerequisite for reading a
    // lab. A local course server should remain usable when its companion shop
    // or private agent runtime is not running.
    fetch(`${assistantApi()}/api/assistant/session`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  }, []);
  async function send(text = input) {
    if (!text.trim() || busy) return; setChat((items) => [...items, { role: "user", text }]); setInput(""); setBusy(true);
    try {
      const response = await fetch(`${assistantApi()}/api/assistant/message`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, surface: "course", context: { path: location.pathname, title: document.title, progress: [] } }) });
      if (!response.body) throw new Error(); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = ""; setChat((items) => [...items, { role: "assistant", text: "" }]);
      for (;;) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split("\n\n"); buffer = frames.pop() ?? ""; for (const frame of frames) { const raw = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6); if (!raw) continue; const event = JSON.parse(raw); if (event.type === "text") { answer += event.text; setChat((items) => [...items.slice(0, -1), { role: "assistant", text: answer }]); } } }
    } catch { setChat((items) => [...items, { role: "assistant", text: "I can’t reach Ask Northwind right now." }]); } finally { setBusy(false); }
  }
  return <div className={open ? "nw-assistant nw-assistant--open" : "nw-assistant"}>{open && <div className="nw-assistant__panel"><header><strong>Ask Northwind</strong><button onClick={() => setOpen(false)} aria-label="Close">×</button></header><div className="nw-assistant__body">{chat.length === 0 && <><p>I can explain this page, find the right next lab, or help with the fictional Northwind store.</p><button onClick={() => send("What should I do next in the course?")}>What should I do next?</button></>}{chat.map((item, i) => <p className={`nw-assistant__message nw-assistant__message--${item.role}`} key={i}>{item.text || "Thinking…"}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question…" maxLength={2000}/><button disabled={busy || !input.trim()}>{busy ? "Thinking…" : "Send"}</button><a href="https://northwind.mlynn.dev/assistant">Open full page</a></form></div>}<button className="nw-assistant__launcher" onClick={() => setOpen(!open)}>{open ? "Close" : "Ask Northwind"}</button></div>;
}
