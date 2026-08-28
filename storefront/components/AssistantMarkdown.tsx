"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders an assistant answer as markdown.
 *
 * THIS IS A TRUST BOUNDARY, not a formatting choice. The string being rendered
 * was written by a model that just read a customer's message, so treating it
 * as markup is exactly the moment an injected instruction could become an
 * injected element. Two properties make that safe, and both are defaults worth
 * stating rather than inheriting silently:
 *
 *   1. NO RAW HTML. `react-markdown` does not render embedded HTML unless you
 *      add `rehype-raw`. We do not. `<img onerror=...>` in the model's output
 *      renders as text.
 *   2. URLS ARE FILTERED. `urlTransform` is narrowed to http, https and
 *      mailto, so `[click here](javascript:...)` loses its href rather than
 *      becoming a working link.
 *
 * Links open in a new tab because the assistant's whole job on the shop is to
 * send people to the course, and losing their conversation to do it would be a
 * strange reward for following the advice.
 */
const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

function safeUrl(url: string): string {
  try {
    // Relative URLs have no protocol of their own and are resolved against the
    // page, so they are safe and must not be dropped.
    const parsed = new URL(url, "https://northwind.mlynn.dev");
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

export default function AssistantMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={safeUrl}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => (
          <code className="rounded bg-pine/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded bg-pine/10 p-2 text-[0.85em] last:mb-0">{children}</pre>
        ),
        h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
