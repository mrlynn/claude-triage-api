import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { labs } from "@/lib/links";
import type { Recording } from "@/lib/explorerWire";
import MessagesExplorer from "./MessagesExplorer";

export const metadata: Metadata = {
  title: "The Messages API, in the open — Northwind Outfitters",
  description:
    "Build a Messages API request option by option, watch the exact bytes go out, see what happens before the first token, and read the stream as it arrives: raw SSE, content blocks, and the assembled message.",
};

/**
 * Read on the server: the handbook the cache preset needs to be long enough to cache, and the recorded exchanges
 * `scripts/record-explorer.ts` saved. A missing recordings folder is not an error; the page still sends live.
 */
function loadRecordings(): Recording[] {
  const dir = join(process.cwd(), "lib", "explorer-recordings");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Recording);
  } catch {
    return [];
  }
}

export default function MessagesApiPage() {
  const handbook = readFileSync(join(process.cwd(), "data", "policies.md"), "utf8");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">Workshop · the Messages API</p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-pine sm:text-3xl">
          The Messages API, in the open
        </h1>
        <p className="text-sm text-pine/75">
          Every feature of Claude&apos;s API is an option on one endpoint, <code className="font-mono">POST /v1/messages</code>.
          Set the options, watch the exact request leave, see what can and cannot be observed before the first token,
          then read the answer three ways: the raw bytes, the content blocks they build, and the message they add up to.
          Nothing here is simulated. Live runs go through this site&apos;s server to the real API, and recorded runs are
          saved copies of live ones.
        </p>
      </header>

      <MessagesExplorer handbook={handbook} recordings={loadRecordings()} />

      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-sm font-semibold text-pine">Four things to take from this page</h2>
        <div className="mt-2 grid gap-4 text-sm leading-relaxed text-pine/70 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-medium text-pine">The API is stateless.</p>
            <p className="mt-1">
              Turn 2 carries turn 1 in <code className="font-mono text-[12px]">messages</code>. Nothing is remembered
              server-side except a cache, and a cache only matches a byte-identical prefix.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">Usage arrives first.</p>
            <p className="mt-1">
              <code className="font-mono text-[12px]">message_start</code> reports input and cache tokens before a word
              is written. That is how a stream cut off halfway can still be billed correctly.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">Parse at the block&apos;s end.</p>
            <p className="mt-1">
              Tool input streams as JSON fragments that do not parse until{" "}
              <code className="font-mono text-[12px]">content_block_stop</code>. Accumulate, then parse once.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">A 400 is documentation.</p>
            <p className="mt-1">
              It arrives before generation, costs nothing and names the rule. Streaming errors are different: they arrive
              after a 200, as an <code className="font-mono text-[12px]">error</code> event.{" "}
              <a href={labs("/docs/labs/lab-4-streaming")} className="underline underline-offset-2">
                Lab 4
              </a>{" "}
              covers both.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
