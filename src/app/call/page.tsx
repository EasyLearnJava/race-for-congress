import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { buildDeck, callHeadline, decodePicks, picksQuery, tally, type CallRace } from "@/lib/call";
import { house, meta, money, ratings } from "@/lib/data";
import { CallClient } from "./_components/call-client";
import type { CallSources, DeckRace } from "./_components/types";

const TITLE = "Make your call";
const DESCRIPTION =
  "Call the closest 2026 House races yourself, Democrat, Toss-up or Republican, and see who reaches 218. Share your call as a link or an image. Your call, not a forecast.";

const races: CallRace[] = house.map(({ id, rating, ratingScore, special, heldBy }) => ({ id, rating, ratingScore, special, heldBy }));
const validIds = new Set(house.map((r) => r.id));

/** Each party's nominee receipts in a race; several nominees of one party are summed. */
function raised(raceId: string, party: "D" | "R"): number | null {
  const rows = money.filter((m) => m.raceId === raceId && m.party === party && m.receipts != null);
  return rows.length ? rows.reduce((sum, m) => sum + (m.receipts ?? 0), 0) : null;
}

function newest(dates: Iterable<string>): string | null {
  let out: string | null = null;
  for (const d of dates) if (d && (!out || d > out)) out = d;
  return out;
}

// A shared link's title and preview image show that call, so they depend on the query string.
// The page itself is static; the marker below tells Next.js the runtime metadata is intended.
export async function generateMetadata({ searchParams }: PageProps<"/call">): Promise<Metadata> {
  const search = await searchParams;
  const picks = decodePicks((key) => {
    const v = search[key];
    return Array.isArray(v) ? v[0] : v;
  }, validIds);
  if (picks.size === 0) {
    return {
      title: TITLE,
      description: DESCRIPTION,
      openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: "/api/og/call", width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", images: ["/api/og/call"] },
    };
  }
  const t = tally(races, picks);
  const title = `A 2026 House call: Democrats ${t.D}, Republicans ${t.R}`;
  const description = `${callHeadline(t)} A personal call made on 218, not a forecast. Make your own.`;
  const image = `/api/og/call?${picksQuery(picks)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

async function Connection() {
  await connection();
  return null;
}

export default function CallPage() {
  const deck: DeckRace[] = buildDeck(house).map((r) => ({
    id: r.id,
    rating: r.rating,
    ratingScore: r.ratingScore,
    ratingCount: r.ratingCount,
    special: r.special,
    heldBy: r.heldBy,
    lean: r.lean,
    incumbentRunning: r.incumbentRunning,
    incumbentParty: r.incumbentParty,
    stateName: r.stateName,
    newLines: r.newLines,
    incumbent: r.incumbent,
    openSeat: r.openSeat,
    dem: r.dem,
    rep: r.rep,
    heldByMember: r.heldByMember,
    pres24: r.pres24,
    cook: r.cook,
    ie: r.ie,
    sabato: r.sabato,
    raisedD: raised(r.id, "D"),
    raisedR: raised(r.id, "R"),
  }));
  const sources: CallSources = {
    ratingsAsOf: newest(ratings.filter((r) => r.chamber === "house").map((r) => r.asOf)),
    moneyAsOf: newest(money.filter((m) => m.chamber === "house").map((m) => m.coverageEnd)),
    generated: meta.generated,
    ratingSources: [...new Set(ratings.filter((r) => r.chamber === "house").map((r) => r.source))].sort(),
  };

  return (
    <>
      <CallClient races={races} deck={deck} sources={sources} />
      <Suspense>
        <Connection />
      </Suspense>
    </>
  );
}
