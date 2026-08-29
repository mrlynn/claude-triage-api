"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Site header, responsive.
 *
 * Below `sm` the four nav items overflowed a 375px viewport by 40px, which
 * cut "Support" in half and made the whole page scroll sideways. Under that
 * breakpoint the links collapse into a disclosure panel.
 *
 * A hamburger is a button, not a decoration, so it carries aria-expanded and
 * aria-controls, closes on Escape, returns focus to the trigger when it does,
 * and closes on navigation — otherwise tapping a link leaves the panel open
 * over the page you just moved to.
 */

const LINKS = [
  { href: "/products", label: "Shop" },
  { href: "/orders", label: "Your orders" },
  { href: "/ops", label: "Ops", title: "Internal operations dashboard" },
  { href: "/queue", label: "Queue", title: "Escalation queue (internal)" },
  {
    href: "/playground/live",
    label: "Live read",
    title: "Watch a message get classified as you type",
  },
  {
    href: "/playground/injection",
    label: "Break it",
    title: "Prompt-injection playground",
  },
];

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1F3D33" />
      <path d="M42 26 L58 47 H30 Z" fill="#5C9A86" />
      <path d="M26 16 L44 47 H8 Z" fill="#F2EDE4" />
      <path d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z" fill="#1F3D33" />
    </svg>
  );
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on navigation. Without this the panel stays open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-20 border-b border-pine/12 bg-bone/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="leading-none">
            <span className="block text-[15px] font-extrabold tracking-tight">
              NORTHWIND
            </span>
            <span className="mt-0.5 block text-[8px] font-semibold tracking-[0.34em] text-spruce">
              OUTFITTERS
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="ml-auto hidden items-center gap-5 text-sm sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.title}
              className="whitespace-nowrap hover:text-spruce"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/support"
            className="whitespace-nowrap rounded-md bg-pine px-3 py-1.5 text-bone hover:bg-spruce"
          >
            Support
          </Link>
        </div>

        {/* Mobile trigger. 44px target, which is the minimum that reliably
            works with a thumb. */}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto grid h-11 w-11 place-items-center rounded-md border border-pine/20 sm:hidden"
        >
          <span className="relative block h-3.5 w-5" aria-hidden="true">
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-pine transition-transform ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-0.5 w-5 bg-pine transition-opacity ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-pine transition-transform ${
                open ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </nav>

      {/* Mobile panel */}
      <div
        id="site-menu"
        ref={panelRef}
        hidden={!open}
        className="border-t border-pine/12 bg-bone px-4 pb-4 pt-2 sm:hidden"
      >
        <ul className="m-0 list-none p-0">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block border-b border-pine/10 py-3 text-base hover:text-spruce"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="pt-3">
            <Link
              href="/support"
              className="block rounded-md bg-pine px-4 py-3 text-center text-base text-bone"
            >
              Contact support
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
