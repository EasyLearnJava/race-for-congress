import { house, hexmap, meta, senate, senateComposition } from "@/lib/data";
import { Overview } from "./_components/overview";

export default function HomePage() {
  const composition = senateComposition();
  return (
    <Overview
      house={house}
      senate={senate}
      hexmap={hexmap}
      composition={composition}
      generated={meta.generated}
      environment={meta.environment ?? null}
    />
  );
}
