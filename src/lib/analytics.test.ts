import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import { envBand, markNavigationSource, noteNavigationFrom, scrubUrls, stripUrl, takeNavigationSource, track } from "./analytics";

describe("stripUrl", () => {
  it("cuts the query string and hash from absolute and relative URLs", () => {
    expect(stripUrl("https://race-for-congress.vercel.app/call?d=az01&r=pa07#top")).toBe("https://race-for-congress.vercel.app/call");
    expect(stripUrl("/call?d=az01&shared=1")).toBe("/call");
    expect(stripUrl("/house/pa-07")).toBe("/house/pa-07");
  });

  it("leaves non-strings alone", () => {
    expect(stripUrl(42)).toBe(42);
    expect(stripUrl(null)).toBe(null);
  });
});

describe("scrubUrls", () => {
  it("removes picks from every URL property, including person properties", () => {
    const event = {
      uuid: "1",
      event: "$pageview",
      properties: {
        $current_url: "https://race-for-congress.vercel.app/call?d=az01.pa07&r=ny17",
        $referrer: "https://race-for-congress.vercel.app/call?t=mi04",
        $pathname: "/call",
        utm_source: "bluesky",
        called: 10,
      },
      $set_once: { $initial_current_url: "https://race-for-congress.vercel.app/call?d=az01" },
    } as unknown as CaptureResult;
    const out = scrubUrls(event)!;
    expect(out.properties.$current_url).toBe("https://race-for-congress.vercel.app/call");
    expect(out.properties.$referrer).toBe("https://race-for-congress.vercel.app/call");
    expect(out.properties.utm_source).toBe("bluesky");
    expect(out.properties.called).toBe(10);
    expect(out.$set_once?.$initial_current_url).toBe("https://race-for-congress.vercel.app/call");
    expect(JSON.stringify(out)).not.toMatch(/az01|pa07|ny17|mi04/);
  });

  it("drops page titles, which hold a shared call's seat counts", () => {
    const event = {
      uuid: "2",
      event: "$pageview",
      properties: { title: "A 2026 House call: Democrats 211, Republicans 194 · 218", $pathname: "/call" },
    } as unknown as CaptureResult;
    const out = scrubUrls(event)!;
    expect(out.properties.title).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/Democrats|Republicans/);
  });

  it("passes a dropped event through", () => {
    expect(scrubUrls(null)).toBeNull();
  });
});

describe("envBand", () => {
  it("is symmetric for both parties", () => {
    for (const v of [0.5, 4.5, 5, 8.4, 10, 15]) {
      expect(envBand(-v)).toBe(envBand(v).replace(/D/g, "R"));
    }
    expect(envBand(0)).toBe("Even");
    expect(envBand(8.4)).toBe("D+5 to D+10");
    expect(envBand(-12)).toBe("R+10 or more");
  });
});

describe("navigation source", () => {
  it("maps the page left to a coarse source, then resets", () => {
    noteNavigationFrom("/house");
    expect(takeNavigationSource()).toBe("explorer");
    expect(takeNavigationSource()).toBe("direct");
    noteNavigationFrom("/states/tx");
    expect(takeNavigationSource()).toBe("state");
    noteNavigationFrom("/senate/nc");
    expect(takeNavigationSource()).toBe("race");
  });

  it("prefers search when search started the navigation", () => {
    markNavigationSource("search");
    noteNavigationFrom("/money");
    expect(takeNavigationSource()).toBe("search");
  });
});

describe("track", () => {
  it("is a no-op when analytics never started", () => {
    expect(() => track("shared_visit", { surface: "call" })).not.toThrow();
  });
});
