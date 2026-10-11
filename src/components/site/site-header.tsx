import Link from "next/link";

import { ElectionCountdown } from "@/components/election-countdown";
import { MainNav } from "./nav";
import { SearchButton } from "./search";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur supports-[backdrop-filter]:bg-page/75">
      <div className="relative mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-baseline gap-2" aria-label="218 Race for Congress, home">
          <span className="font-serif text-2xl leading-none font-bold tracking-tight">218</span>
          <span className="hidden text-[10px] font-semibold tracking-[0.18em] text-ink-2 uppercase 2xl:inline">Race for Congress</span>
        </Link>
        <div className="flex flex-1 items-center justify-end gap-2 xl:justify-between">
          <MainNav />
          <div className="flex items-center gap-2">
            <SearchButton />
            <div className="hidden sm:block xl:hidden 2xl:block">
              <ElectionCountdown />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
