import { renderToStaticMarkup } from "react-dom/server";
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

describe("the shell serves the production creatives, not stand-ins", () => {
  /**
   * The older iframe preview and the /partners/ChessUSA/N links must show the
   * SAME three units. A shell that showed placeholders, or an image pair whose
   * files were never added, showed the advertiser one thing while the links
   * showed another — and the third option was a broken image on the live
   * domain until this mapping existed.
   */
  it.each([
    ["editorial", "2a"],
    ["bold", "2b"],
    ["three", "2c"],
  ] as const)("shell option %s is Turn-2 creative %s", (variant, code) => {
    const creative = chessusaCreative(variant);
    expect(creative.kind).toBe("html");
    expect(chessusaUtm(variant).content).toBe(code);
  });

  /**
   * Guards a requirement that is invisible until it silently breaks: common
   * ad-blocker filter lists match on these substrings in a request path, and
   * artwork served from one of them simply does not render for a chunk of
   * real users. Renaming the assets "helpfully" is exactly the change this
   * test exists to catch. The logos are CSS backgrounds, so the paths are
   * read out of the rendered stylesheet rather than off an <img>.
   */
  it("references artwork only from neutral paths no filter list matches", () => {
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
    const seen: string[] = [];
    for (const variant of ["editorial", "bold", "three"] as const) {
      const creative = chessusaCreative(variant);
      if (creative.kind !== "html") throw new Error("expected html creative");
      const html = renderToStaticMarkup(creative.node);
      const re = /url\(([^)]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) seen.push(m[1].replace(/["']/g, ""));
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const path of seen) {
      expect(path.startsWith("/img/p/")).toBe(true);
      for (const needle of bait) {
        expect(path.toLowerCase()).not.toContain(needle);
      }
    }
  });
});

describe("chessusaUtm", () => {
  it("tags clicks with the creative code the production links use", () => {
    // The shell and /partners/ChessUSA/N must reconcile in analytics, so both
    // send 2a/2b/2c rather than the shell's own historical option ids.
    expect(chessusaUtm("editorial").content).toBe("2a");
    expect(chessusaUtm("bold").content).toBe("2b");
    expect(chessusaUtm("three").content).toBe("2c");
  });
});
