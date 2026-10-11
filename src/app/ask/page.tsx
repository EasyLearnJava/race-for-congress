import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { AskClient } from "./_components/ask-client";

export const metadata: Metadata = {
  title: "Ask 218",
  description: "Ask questions about the 2026 House and Senate races in plain English. Answers come from this site's data and model.",
};

export default function AskPage() {
  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Ask 218" }]}
        eyebrow="AI analyst"
        title="Ask 218"
        description="Ask about any race, state, forecaster or chamber. The analyst (Claude) answers by querying this site's data and model, so every number matches the dashboards and follows your national-vote setting."
      />
      <AskClient />
    </div>
  );
}
