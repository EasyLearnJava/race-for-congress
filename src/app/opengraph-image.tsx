import { ImageResponse } from "next/og";

import { house } from "@/lib/data";
import { RATING_ORDER } from "@/lib/ratings";

export const alt = "218 · Race for Congress: nonpartisan analytics for the 2026 US midterms";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Light-theme rating colors (the share card is always light).
const COLORS: Record<string, string> = {
  "Safe D": "#1859a8",
  "Likely D": "#3c86e4",
  "Lean D": "#80b4f9",
  Tossup: "#868686",
  "Lean R": "#f19489",
  "Likely R": "#e95048",
  "Safe R": "#9c1b1b",
};

export default function OpengraphImage() {
  const counts = RATING_ORDER.map((r) => ({ r, n: house.filter((h) => h.rating === r).length }));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f9f9f7", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: "#0b0b0b" }}>218</div>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#52514e" }}>RACE FOR CONGRESS</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 64, fontWeight: 700, color: "#0b0b0b", lineHeight: 1.1 }}>435 seats. 218 to win.</div>
        <div style={{ marginTop: 18, fontSize: 30, color: "#52514e" }}>
          Every 2026 House and Senate race, forecaster ratings, money and a live scenario model.
        </div>
        <div style={{ display: "flex", marginTop: "auto", height: 56, width: "100%" }}>
          {counts.map(({ r, n }) => (
            <div key={r} style={{ display: "flex", width: `${(n / 435) * 100}%`, height: 56, background: COLORS[r], marginRight: 3 }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 22, color: "#52514e" }}>
          <span>Democrats</span>
          <span>Forecaster consensus, all 435 seats</span>
          <span>Republicans</span>
        </div>
      </div>
    ),
    size,
  );
}
