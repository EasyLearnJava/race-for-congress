import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";

import { ScenarioBar } from "@/components/scenario/scenario-bar";
import { ScenarioProvider } from "@/components/scenario/scenario";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { THEME_BOOTSTRAP } from "@/components/site/theme-toggle";
import { baselineEnvironment, meta } from "@/lib/data";
import { fmtDate, fmtMargin } from "@/lib/format";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://race-for-congress.vercel.app"),
  title: {
    default: "218 · Race for Congress: 2026 midterm analytics",
    template: "%s · 218 Race for Congress",
  },
  description:
    "Nonpartisan, interactive analytics for the 2026 US midterms: every House and Senate race, forecaster ratings, redistricting, money and a live scenario model. Drill from the nation to a state to a district.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const baseline = baselineEnvironment();
  const env = meta.environment;
  const baselineLabel = env
    ? `Average of ${env.n_sources} generic-ballot polling averages, ${fmtMargin(env.margin)} as of ${fmtDate(env.as_of)}`
    : "No polling average loaded; using an even national vote";

  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ScenarioProvider baselineEnv={baseline} baselineLabel={baselineLabel}>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-surface focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to content
          </a>
          <SiteHeader />
          <ScenarioBar />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </ScenarioProvider>
      </body>
    </html>
  );
}
