"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { usePresence } from "@/lib/use-presence";

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/house", label: "House" },
  { href: "/senate", label: "Senate" },
  { href: "/states", label: "States" },
  { href: "/forecasters", label: "Forecasters" },
  { href: "/money", label: "Money" },
  { href: "/redistricting", label: "Redistricting" },
  { href: "/simulator", label: "Simulator" },
  { href: "/call", label: "Your call" },
  { href: "/ask", label: "Ask AI" },
  { href: "/data", label: "Data" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav() {
  const pathname = usePathname();
  const { href } = useScenario();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open);
  const bar = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  // Desktop: one pill behind the current page that glides to the next page on navigation.
  useLayoutEffect(() => {
    const nav = bar.current;
    const p = pill.current;
    if (!nav || !p) return;
    const place = (animate: boolean) => {
      const active = nav.querySelector<HTMLAnchorElement>('[aria-current="page"]');
      if (!active) {
        p.style.opacity = "0";
        return;
      }
      p.style.transition = animate
        ? "transform var(--spring) var(--ease-spring), width var(--spring) var(--ease-spring), opacity 150ms ease"
        : "none";
      p.style.width = `${active.offsetWidth}px`;
      p.style.transform = `translateX(${active.offsetLeft}px)`;
      p.style.opacity = "1";
    };
    place(placed.current);
    placed.current = true;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [pathname]);

  const links = (onClick?: () => void, pillBehind = false) =>
    NAV.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href === "/data" ? item.href : href(item.href)}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={`press relative rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
            active ? `font-semibold text-ink ${pillBehind ? "" : "bg-surface-2"}` : "text-ink-2 hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <>
      <nav ref={bar} aria-label="Main" className="relative hidden items-center gap-0.5 xl:flex">
        <span
          ref={pill}
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 left-0 rounded-full bg-(--seg-track) opacity-0"
        />
        {links(undefined, true)}
      </nav>
      <div className="xl:hidden">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {open ? "Close" : "Menu"}
        </button>
        {menu.mounted && (
          // Grows from the Menu button (top right) and returns to it.
          <nav
            id="mobile-nav"
            aria-label="Main"
            data-state={menu.state}
            inert={!open}
            style={{ "--origin": "top right" } as CSSProperties}
            className="popover absolute inset-x-0 top-full z-40 grid grid-cols-2 gap-1 border-b border-line bg-surface p-3 shadow-lg sm:grid-cols-3"
          >
            {links(() => setOpen(false))}
          </nav>
        )}
      </div>
    </>
  );
}
