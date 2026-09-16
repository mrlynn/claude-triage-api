"use client";

import { useState } from "react";

/**
 * Thumbs under an Ask Northwind reply on the storefront. The course site has a
 * fuller control (`website/src/components/Feedback`); this one is the compact
 * form only, because a support chat is not where anyone writes a paragraph
 * about the chat. Longer feedback has a page on the course site.
 *
 * Same endpoint, same rules: the rating and the page's path are sent, never
 * the reply being rated.
 */
export default function ReplyThumbs() {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [failed, setFailed] = useState(false);

  const rate = async (value: "up" | "down") => {
    setRating(value);
    setFailed(false);
    const path = window.location.pathname;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface: "assistant",
          site: "storefront",
          rating: value,
          path: /^\/[A-Za-z0-9/_.-]{0,199}$/.test(path) ? path : null,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setRating(null);
      setFailed(true);
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-1 text-xs text-pine/55">
      {(["up", "down"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={value === "up" ? "Helpful" : "Not helpful"}
          aria-pressed={rating === value}
          disabled={rating !== null}
          onClick={() => rate(value)}
          className={`rounded-full border px-1.5 leading-5 ${
            rating === value ? "border-spruce bg-spruce/25" : "border-pine/15 opacity-75 hover:opacity-100 disabled:opacity-30"
          }`}
        >
          {value === "up" ? "👍" : "👎"}
        </button>
      ))}
      {rating && <span>Thanks.</span>}
      {failed && <span>Could not send that.</span>}
    </div>
  );
}
