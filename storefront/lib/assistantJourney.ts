import { labs } from "./links";

/**
 * The course, as a thing the assistant can point at.
 *
 * WHY A FIXED LIST rather than a search over the docs: "where do I go next" has
 * a small number of correct answers, and the failure mode of a retrieval system
 * here is a confidently invented URL. A learner who follows a 404 concludes the
 * course is broken, not that the model guessed. Ten curated entries cannot
 * produce a link that does not exist.
 *
 * Hrefs are absolute via `labs()` rather than relative paths, because the
 * assistant answers on BOTH sites. A relative `/docs/...` is correct on the
 * course and a 404 on the shop, and leaving the model to prefix the host is
 * exactly the kind of instruction that works until it doesn't.
 */
export const JOURNEY = [
  { id: "lab-1", title: "Your first call", href: labs("/docs/labs/lab-1-first-call"), when: "Start here if you are new to the API." },
  { id: "lab-2", title: "Structured outputs", href: labs("/docs/labs/lab-2-structured-outputs"), when: "Use after a first successful request." },
  { id: "lab-3", title: "Tool use and the agentic loop", href: labs("/docs/labs/lab-3-tool-use"), when: "Use when an answer needs trusted facts." },
  { id: "lab-4", title: "Streaming", href: labs("/docs/labs/lab-4-streaming"), when: "Use when a human is waiting." },
  { id: "lab-5", title: "Prompt caching", href: labs("/docs/labs/lab-5-prompt-caching"), when: "Use for stable repeated context." },
  { id: "lab-6", title: "Evals", href: labs("/docs/labs/lab-6-evals"), when: "Measure before making a quality claim." },
  { id: "lab-7", title: "Choosing a model", href: labs("/docs/labs/lab-7-choosing-a-model"), when: "Use when cost or latency is the question." },
  { id: "lab-8", title: "The trust boundary", href: labs("/docs/labs/lab-8-trust-boundary"), when: "Use when untrusted text reaches a prompt." },
  { id: "lab-9", title: "Shipping it", href: labs("/docs/labs/lab-9-shipping-it"), when: "Use when the thing works and has to stay working." },
  { id: "lab-10", title: "Ask Northwind", href: labs("/docs/labs/lab-10-ask-northwind"), when: "Capstone: build a safe cross-site assistant." },
] as const;

/** Naive term overlap. Ten entries do not need an index, and an exact-match
 *  miss falls back to the first two steps rather than to nothing. */
export function findJourney(query: string) {
  const terms = query.toLowerCase().split(/\W+/);
  return JOURNEY.filter((item) =>
    terms.some((term) => term.length > 2 && `${item.title} ${item.when}`.toLowerCase().includes(term)),
  ).slice(0, 3);
}
