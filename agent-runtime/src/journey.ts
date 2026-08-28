export const JOURNEY = [
  { id: "lab-1", title: "Your first call", href: "/docs/labs/lab-1-first-call", when: "Start here if you are new to the API." },
  { id: "lab-2", title: "Structured outputs", href: "/docs/labs/lab-2-structured-outputs", when: "Use after a first successful request." },
  { id: "lab-3", title: "Tool use and the agentic loop", href: "/docs/labs/lab-3-tool-use", when: "Use when an answer needs trusted facts." },
  { id: "lab-4", title: "Streaming", href: "/docs/labs/lab-4-streaming", when: "Use when a human is waiting." },
  { id: "lab-5", title: "Prompt caching", href: "/docs/labs/lab-5-prompt-caching", when: "Use for stable repeated context." },
  { id: "lab-6", title: "Evals", href: "/docs/labs/lab-6-evals", when: "Measure before making a quality claim." },
  { id: "lab-10", title: "Ask Northwind", href: "/docs/labs/lab-10-ask-northwind", when: "Capstone: build a safe cross-site agent." },
] as const;

export function findJourney(query: string) { const terms = query.toLowerCase().split(/\W+/); return JOURNEY.filter((item) => terms.some((term) => term.length > 2 && `${item.title} ${item.when}`.toLowerCase().includes(term))).slice(0, 3); }
