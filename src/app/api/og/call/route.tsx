import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { HOUSE_SEATS, MAJORITY, callHeadline, decodePicks, tally, type CallRace } from "@/lib/call";
import { house } from "@/lib/data";

// Share images for a call: a 1200x630 link preview, or a 1080x1920 story with ?format=story.
// The picks come from the query string and are only drawn, never stored or logged.

const races: CallRace[] = house.map(({ id, rating, ratingScore, special, heldBy }) => ({ id, rating, ratingScore, special, heldBy }));
const validIds = new Set(races.map((r) => r.id));

// Light-theme tokens from globals.css (the share images are always light).
const C = {
  page: "#f9f9f7",
  ink: "#0b0b0b",
  ink2: "#52514e",
  dem: "#1859a8",
  demBar: "#3c86e4",
  rep: "#9c1b1b",
  repBar: "#e95048",
  toss: "#868686",
  open: "#e1e0d9",
};

export function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const story = search.get("format") === "story";
  const picks = decodePicks((k) => search.get(k), validIds);
  const t = tally(races, picks);
  const empty = picks.size === 0;
  const undecided = t.T + t.open;
  const scale = story ? 1.5 : 1;
  const px = (n: number) => Math.round(n * scale);

  const segments = [
    { key: "D", n: t.D, color: C.demBar },
    { key: "T", n: t.T, color: C.toss },
    { key: "open", n: t.open, color: C.open },
    { key: "R", n: t.R, color: C.repBar },
  ].filter((s) => s.n > 0);

  const bar = (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ display: "flex", position: "relative", width: "100%", height: px(48) }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: "flex", width: `${(s.n / HOUSE_SEATS) * 100}%`, height: "100%", background: s.color }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: `${(MAJORITY / HOUSE_SEATS) * 100}%`,
            top: px(-10),
            width: px(4),
            height: px(68),
            background: C.ink,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: px(12), fontSize: px(20), color: C.ink2 }}>218 for a majority</div>
    </div>
  );

  const rows = [
    { label: "Democrats", n: t.D, color: C.dem },
    ...(undecided > 0 ? [{ label: "Undecided", n: undecided, color: C.toss }] : []),
    { label: "Republicans", n: t.R, color: C.rep },
  ];

  // Wide: three columns, Democrats left and Republicans right. Story: one row per count.
  const counts = story ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 36 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", width: 420, fontSize: 180, fontWeight: 800, color: r.color, lineHeight: 1 }}>{r.n}</div>
          <div style={{ display: "flex", fontSize: 48, color: C.ink2 }}>{r.label}</div>
        </div>
      ))}
    </div>
  ) : (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: r.color, lineHeight: 1 }}>{r.n}</div>
          <div style={{ display: "flex", fontSize: 22, color: C.ink2, marginTop: 6 }}>{r.label}</div>
        </div>
      ))}
    </div>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "baseline", gap: px(16) }}>
      <div style={{ display: "flex", fontSize: px(44), fontWeight: 800, color: C.ink }}>218</div>
      <div style={{ display: "flex", fontSize: px(18), letterSpacing: px(5), color: C.ink2 }}>RACE FOR CONGRESS</div>
    </div>
  );

  const title = empty ? "Make your 2026 House call" : "My 2026 House call";
  const subtitle = empty ? "Call the closest seats yourself and see who reaches 218." : callHeadline(t);
  const footer = (
    <div style={{ display: "flex", flexDirection: story ? "column" : "row", justifyContent: "space-between", width: "100%", gap: px(8), fontSize: story ? 32 : 20, color: C.ink2 }}>
      <div style={{ display: "flex" }}>Make yours at race-for-congress.vercel.app/call</div>
      <div style={{ display: "flex" }}>A personal call, not a forecast</div>
    </div>
  );

  const body = story ? (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.page, padding: 96, fontFamily: "sans-serif" }}>
      {header}
      <div style={{ display: "flex", marginTop: 160, fontSize: 84, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{title}</div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 40, color: C.ink2, lineHeight: 1.3 }}>{subtitle}</div>
      <div style={{ display: "flex", marginTop: 120 }}>{counts}</div>
      <div style={{ display: "flex", marginTop: 120 }}>{bar}</div>
      <div style={{ display: "flex", marginTop: "auto" }}>{footer}</div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.page, padding: 56, fontFamily: "sans-serif" }}>
      {header}
      <div style={{ display: "flex", marginTop: 18, fontSize: 52, fontWeight: 700, color: C.ink }}>{title}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 26, color: C.ink2 }}>{subtitle}</div>
      <div style={{ display: "flex", marginTop: 22 }}>{counts}</div>
      <div style={{ display: "flex", marginTop: 26 }}>{bar}</div>
      <div style={{ display: "flex", marginTop: "auto" }}>{footer}</div>
    </div>
  );

  return new ImageResponse(body, {
    width: story ? 1080 : 1200,
    height: story ? 1920 : 630,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
