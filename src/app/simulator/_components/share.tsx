"use client";

// Share the scenario: the full URL (scenario params included) in a read-only field and a
// copy button. The origin is read from the browser after hydration, so the prerendered page
// shows the path alone and never touches window on the server.
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { fmtMargin } from "@/lib/format";

const subscribeNever = () => () => {};

function useShareUrl(): string {
  const { href } = useScenario();
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );
  return `${origin}${href("/simulator")}`;
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async (fallback?: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      fallback?.();
    }
  };
  return { copied, copy };
}

/** A compact "Copy link" button for the page header. */
export function CopyLinkButton() {
  const url = useShareUrl();
  const { copied, copy } = useCopy(url);
  return (
    <button
      type="button"
      onClick={() => copy()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2"
    >
      <LinkIcon />
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

export function ShareCard() {
  const { params } = useScenario();
  const url = useShareUrl();
  const { copied, copy } = useCopy(url);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  return (
    <Card className="mt-6">
      <SectionTitle
        title="Share this scenario"
        description="The link carries every setting above, so anyone who opens it sees the same numbers. Links from this page to races and states keep the scenario too."
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Link to this scenario
        </label>
        <input
          id={id}
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
        />
        <button
          type="button"
          onClick={() => copy(() => inputRef.current?.select())}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-surface hover:opacity-90"
        >
          <LinkIcon />
          <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-2">
        National vote {fmtMargin(params.env)} · weight on ratings {Math.round(params.expertWeight * 100)}% · incumbency{" "}
        {params.incumbency.toFixed(1)} pts · national error ±{params.sigmaNational.toFixed(1)} pts · race error ±
        {params.sigmaRace.toFixed(1)} pts
      </p>
    </Card>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.7.7" />
      <path d="M9.5 6.5a3 3 0 0 0-4.2 0L3.2 8.6a3 3 0 0 0 4.2 4.2l.7-.7" />
    </svg>
  );
}
