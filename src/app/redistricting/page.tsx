import type { Metadata } from "next";

import { hexmap, house, meta, oldLines, redistrictingCurve, redistrictingDistricts } from "@/lib/data";
import { REDRAWN_2026 } from "@/lib/data/states";
import { RedistrictingDashboard } from "./_components/redistricting-dashboard";
import { curvePoints, oldDistricts } from "./_lib/data";

export const metadata: Metadata = {
  title: "Redistricting: the new maps",
  description:
    "Nine states drew new congressional maps for 2026. See which seats changed hands on paper, how each state's delegation leans on the new lines, and how far the maps moved the House finish line.",
};

export default function RedistrictingPage() {
  return (
    <RedistrictingDashboard
      house={house}
      hexmap={hexmap}
      oldDistricts={oldDistricts(oldLines, redistrictingDistricts, REDRAWN_2026)}
      curve={curvePoints(redistrictingCurve, REDRAWN_2026)}
      nationalMargin={meta.national_2024?.margin ?? 0}
      generated={meta.generated}
    />
  );
}
