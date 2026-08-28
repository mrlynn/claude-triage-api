import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders an assistant answer as markdown.
 *
 * HAND-MIRRORED from `storefront/components/AssistantMarkdown.tsx`, which
 * carries the full reasoning, for the same reason `untrusted.ts` is mirrored:
 * the two apps build from separate roots and cannot import across them. The
 * short version, because it is the part that matters:
 *
 * Rendering model output as markup is a trust boundary. The model just read a
 * customer's message, so this is where an injected instruction would try to
 * become an injected element. Raw HTML is not rendered (no `rehype-raw`), and
 * `urlTransform` allows only http, https and mailto — so a `javascript:` link
 * loses its href instead of working.
 */
const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://triage.mlynn.dev");
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

export default function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="nw-assistant__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
