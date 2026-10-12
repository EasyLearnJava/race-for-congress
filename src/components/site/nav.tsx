"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties } from "react";

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

  const links = (onClick?: () => void) =>
    NAV.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href === "/data" ? item.href : href(item.href)}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={`press rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
            active ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
        {links()}
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
