import type { Metadata } from "next";

import { house, meta, senate } from "@/lib/data";
import { StatesIndex } from "./_components/states-index";
import { slimRace, slimSenate } from "./_components/shared";

export const metadata: Metadata = {
  title: "States",
  description:
    "Every state's House delegation now and in the model's scenario: expected net seat change, competitive seats, toss-ups, Senate races and the states voting on new maps.",
};

export default function StatesPage() {
  return <StatesIndex races={house.map(slimRace)} senate={senate.map(slimSenate)} generated={meta.generated} />;
}
