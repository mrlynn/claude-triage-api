"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Site header, responsive.
 *
 * Primary nav is the shop fiction (Shop, Orders, Support). Workshop tools
 * (Ops, Queue, Live read, Break it) live in a secondary disclosure so a cold
 * visitor stays in Northwind and attendees still find the demos.
 */

const SHOP = [
  { href: "/products", label: "Shop" },
  { href: "/orders", label: "Your orders" },
] as const;

const WORKSHOP = [
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
] as const;

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1F3D33" />
      <path d="M42 26 L58 47 H30 Z" fill="#5C9A86" />
      <path d="M26 16 L44 47 H8 Z" fill="#F2EDE4" />
      <path
        d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z"
        fill="#1F3D33"
      />
    </svg>
  );
}

function NavLink({
  href,
  label,
  title,
  className = "",
}: {
  href: string;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`whitespace-nowrap hover:text-spruce ${className}`}
    >
      {label}
    </Link>
  );
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const workshopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setWorkshopOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !workshopOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setWorkshopOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (
        open &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
      if (
        workshopOpen &&
        !workshopRef.current?.contains(target)
      ) {
        setWorkshopOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, workshopOpen]);

  const workshopActive = WORKSHOP.some((l) => pathname.startsWith(l.href));

  return (
    <header className="sticky top-0 z-20 border-b border-pine/12 bg-bone/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="leading-none">
            <span className="font-display block text-[15px] font-extrabold tracking-tight">
              NORTHWIND
            </span>
            <span className="mt-0.5 block text-[8px] font-semibold tracking-[0.34em] text-spruce">
              OUTFITTERS
            </span>
          </span>
        </Link>

        <div className="ml-auto hidden items-center gap-5 text-sm sm:flex">
          {SHOP.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} />
          ))}

          <div className="relative" ref={workshopRef}>
            <button
              type="button"
              aria-expanded={workshopOpen}
              aria-haspopup="menu"
              onClick={() => setWorkshopOpen((v) => !v)}
              className={`whitespace-nowrap hover:text-spruce ${
                workshopActive || workshopOpen ? "text-spruce" : ""
              }`}
            >
              Workshop
              <span className="ml-1 inline-block text-[10px] opacity-60" aria-hidden>
                ▾
              </span>
            </button>
            {workshopOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 min-w-[11rem] rounded-md border border-pine/15 bg-bone py-1 shadow-sm"
              >
                {WORKSHOP.map((l) => (
                  <Link
                    key={l.href}
                    role="menuitem"
                    href={l.href}
                    title={l.title}
                    className="block px-3.5 py-2 text-sm hover:bg-pine/5 hover:text-spruce"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/support"
            className="whitespace-nowrap rounded-md bg-pine px-3 py-1.5 text-bone hover:bg-spruce"
          >
            Support
          </Link>
        </div>

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

      <div
        id="site-menu"
        ref={panelRef}
        hidden={!open}
        className="border-t border-pine/12 bg-bone px-4 pb-4 pt-2 sm:hidden"
      >
        <ul className="m-0 list-none p-0">
          {SHOP.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block border-b border-pine/10 py-3 text-base hover:text-spruce"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="border-b border-pine/10 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-pine/45">
              Workshop
            </p>
            {WORKSHOP.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block py-2.5 text-base hover:text-spruce"
              >
                {l.label}
              </Link>
            ))}
          </li>
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
