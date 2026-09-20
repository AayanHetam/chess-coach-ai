import { describe, expect, it } from "vitest";

import { withUtm } from "../PartnerBanner";
import { chessusaCreative, chessusaUtm } from "../chessusaCreative";
import { isPageId, isVariantId } from "../previewOptions";

describe("withUtm", () => {
  const utm = {
    source: "chessmasti",
    medium: "display",
    campaign: "chessusa_2026q3",
    content: "editorial",
  };

  it("appends every supplied param", () => {
    const url = new URL(withUtm("https://www.chessusa.com/", utm));
    expect(url.searchParams.get("utm_source")).toBe("chessmasti");
    expect(url.searchParams.get("utm_medium")).toBe("display");
    expect(url.searchParams.get("utm_campaign")).toBe("chessusa_2026q3");
    expect(url.searchParams.get("utm_content")).toBe("editorial");
  });

  it("omits params that were not supplied", () => {
    const url = new URL(withUtm("https://www.chessusa.com/", utm));
    expect(url.searchParams.has("utm_term")).toBe(false);
  });

  it("preserves query the advertiser already put on the destination", () => {
    const url = new URL(
      withUtm("https://www.chessusa.com/sale?ref=partner&id=7", utm)
    );
    expect(url.searchParams.get("ref")).toBe("partner");
    expect(url.searchParams.get("id")).toBe("7");
    expect(url.searchParams.get("utm_source")).toBe("chessmasti");
  });

  it("overwrites a stale utm already on the destination", () => {
    const url = new URL(
      withUtm("https://www.chessusa.com/?utm_source=somewhere-else", utm)
    );
    expect(url.searchParams.getAll("utm_source")).toEqual(["chessmasti"]);
  });

  it("returns the href untouched rather than throwing on a bad URL", () => {
    expect(withUtm("not a url", utm)).toBe("not a url");
  });
});

describe("option guards", () => {
  it("accepts the ids the routes actually serve", () => {
    expect(isVariantId("editorial")).toBe(true);
    expect(isVariantId("bold")).toBe(true);
    expect(isVariantId("three")).toBe(true);
    expect(isPageId("home")).toBe(true);
    expect(isPageId("analyze")).toBe(true);
    expect(isPageId("learn")).toBe(true);
  });

  it("rejects anything else, so a hand-edited query string falls back", () => {
    for (const bad of ["", "HOME", "analysis", undefined, null, 3, {}]) {
      expect(isVariantId(bad)).toBe(false);
      expect(isPageId(bad)).toBe(false);
    }
  });
});

describe("chessusa image creative", () => {
  const creative = chessusaCreative("three");

  it("is the variant that exercises the <picture> path", () => {
    expect(creative.kind).toBe("image");
  });

  it("carries intrinsic dimensions, without which the slot cannot reserve space", () => {
    if (creative.kind !== "image") throw new Error("expected image creative");
    expect(creative.wide).toMatchObject({ width: 728, height: 90 });
    expect(creative.narrow).toMatchObject({ width: 320, height: 100 });
  });

  /**
   * Guards a requirement that is invisible until it silently breaks: common
   * ad-blocker filter lists match on these substrings in a request path, and
   * a creative served from one of them simply does not render for a chunk of
   * real users. Renaming the assets "helpfully" is exactly the change this
   * test exists to catch.
   */
  it("serves from neutral paths no filter list matches", () => {
    if (creative.kind !== "image") throw new Error("expected image creative");
    const paths = [
      creative.wide.src,
      creative.wide.src2x,
      creative.narrow.src,
      creative.narrow.src2x,
    ];
    const bait = [
      "/ads/",
      "/ad/",
      "advert",
      "banner",
      "sponsor",
      "promo",
      "doubleclick",
      "728x90",
      "320x100",
    ];
    for (const path of paths) {
      expect(path.startsWith("/img/p/")).toBe(true);
      for (const needle of bait) {
        expect(path.toLowerCase()).not.toContain(needle);
      }
    }
  });
});

describe("chessusaUtm", () => {
  it("tags the creative variant so placements are attributable", () => {
    expect(chessusaUtm("bold").content).toBe("bold");
    expect(chessusaUtm("three").content).toBe("three");
  });
});
