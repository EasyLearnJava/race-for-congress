// Small presentational building blocks shared by every page. Server-safe (no hooks).
import Link from "next/link";
import type { ReactNode } from "react";

import type { Party, RatingLabel } from "@/lib/data/types";
import { PARTY_NAME } from "@/lib/format";
import { RATING_COLOR, RATING_TEXT, partyColor } from "@/lib/ratings";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function SectionTitle({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <header className="pt-6 pb-5 sm:pt-8">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      {eyebrow && <div className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{eyebrow}</div>}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {actions}
      </div>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2 sm:text-base">{description}</p>}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-xs text-ink-2">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-muted">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Stat tile: label, a proportional-figure value, optional detail line. */
export function Stat({
  label,
  value,
  detail,
  accent,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  accent?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {accent && <span aria-hidden className="size-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{value}</div>
      {detail && <div className="mt-0.5 text-xs leading-5 text-ink-2">{detail}</div>}
    </>
  );
  const cls = "block rounded-xl border border-line bg-surface p-4";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-surface-2`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RatingChip({ rating, size = "sm" }: { rating: RatingLabel | string; size?: "xs" | "sm" }) {
  const r = rating as RatingLabel;
  if (!RATING_COLOR[r]) return <span className="text-xs text-muted">{rating || "—"}</span>;
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold whitespace-nowrap ${size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"}`}
      style={{ background: RATING_COLOR[r], color: RATING_TEXT[r] }}
    >
      {rating}
    </span>
  );
}

export function PartyTag({ party, label }: { party: Party | string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-ink">
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: partyColor(party) }} />
      {label ?? PARTY_NAME[party] ?? party}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "info" }) {
  const tones = {
    neutral: "border-line text-ink-2",
    warn: "border-serious/50 text-ink",
    info: "border-line text-ink",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-8 text-center">
      <div className="text-sm font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}
