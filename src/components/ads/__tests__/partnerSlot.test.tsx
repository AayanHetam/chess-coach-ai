import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LABEL_COLOUR,
  SLOT_HEIGHT,
  SLOT_MAX_WIDTH,
  SWAP_PX,
} from "../PartnerBanner";
import {
  LABEL_BLOCK_PX,
  PARTNER_ATTR,
  PARTNER_CREATIVES,
  PARTNER_SLOT_CLASS,
  PartnerSlot,
  PARTNER_PREVIEW_PATH_JS,
  SLOT_MARGIN_PX,
  SLOT_RESERVE,
  isPartnerPreviewPath,
  partnerBootScript,
  partnerSlotCss,
  previewForPath,
} from "../PartnerSlot";
import {
  TURN_TWO_IDS,
  TURN_TWO_META,
  isTurnTwoId,
  turnTwoCreative,
} from "../chessusaTurn2";
import {
  PARTNERS,
  PARTNER_OPTION_IDS,
  PARTNER_SLUGS,
  partnerAttrValue,
} from "../partners";
import { BARCODE_BAR_WIDTHS } from "../chesshouseTurn2";

/**
 * Every unit the surface can serve: each advertiser's three creatives. New
 * advertisers join these checks by existing in the registry, which is the
 * point — the invariants below are properties of the SLOT, not of ChessUSA.
 */
const EVERY_UNIT = PARTNER_SLUGS.flatMap((slug) =>
  PARTNER_OPTION_IDS.map((option) => [slug, option] as const)
);

describe("the slot is invisible to everyone who did not open a preview link", () => {
  /**
   * renderToStaticMarkup runs no effects, so this is exactly what the server
   * sends and what a normal visitor's browser parses. If the banner ever shows
   * up here, it is shipping to real users.
   */
  const ssr = renderToStaticMarkup(<PartnerSlot pathname="/puzzles" />);

  it("server-renders an empty wrapper, not a banner", () => {
    expect(ssr).toContain(PARTNER_SLOT_CLASS);
    expect(ssr).not.toContain("Advertisement");
    expect(ssr).not.toContain("CHESSMASTI");
    for (const partner of Object.values(PARTNERS)) {
      expect(ssr).not.toContain(new URL(partner.href).hostname);
      expect(ssr).not.toContain(partner.displayName);
    }
  });

  it("ships no artwork reference a browser could prefetch", () => {
    expect(ssr).not.toContain("/img/p/");
    expect(ssr).not.toContain("<img");
  });

  it("renders nothing on the server even ON a preview path", () => {
    /**
     * Two-phase by design. A statically optimised page is rendered once at
     * build time and reused for every URL that rewrites onto it, so its HTML
     * must not depend on the request path — and the client's first render has
     * to match that HTML or React tears the tree down. The banner therefore
     * appears only after mount, into a box the head CSS has already sized.
     */
    const onPrefix = renderToStaticMarkup(
      <PartnerSlot pathname="/partners/chessusa/1/puzzles" />
    );
    expect(onPrefix).toBe(ssr);
  });

  it("hides the wrapper by default and only reveals it under the attribute", () => {
    expect(partnerSlotCss).toContain(`.${PARTNER_SLOT_CLASS}{display:none}`);
    expect(partnerSlotCss).toContain(`html[${PARTNER_ATTR}]`);
  });
});

describe("the reserve matches what it reserves for", () => {
  /**
   * The banner mounts after hydration, so the wrapper must already be its
   * final height or the page jumps. These are the same numbers PartnerBanner
   * lays out with, re-derived rather than copied.
   */
  it("equals label + creative + margin at both breakpoints", () => {
    expect(SLOT_RESERVE.wide).toBe(
      LABEL_BLOCK_PX + SLOT_HEIGHT.wide + SLOT_MARGIN_PX
    );
    expect(SLOT_RESERVE.narrow).toBe(
      LABEL_BLOCK_PX + SLOT_HEIGHT.narrow + SLOT_MARGIN_PX
    );
  });

  it("puts both heights into the pre-paint CSS, swapping at the same point", () => {
    expect(partnerSlotCss).toContain(`min-height:${SLOT_RESERVE.narrow}px`);
    expect(partnerSlotCss).toContain(`min-height:${SLOT_RESERVE.wide}px`);
    expect(partnerSlotCss).toContain(`@media (min-width:${SWAP_PX}px)`);
  });
});

describe("which URLs activate the slot", () => {
  /**
   * The single most important function here. Everything else is layout; this
   * is the line between "an advertiser sees a mock-up" and "we put an
   * unapproved ad on the live site". Every case that must return null is a
   * case where a real visitor would otherwise see the banner.
   */
  it.each([
    ["/partners/chessusa/1", "chessusa", "1"],
    ["/partners/chessusa/2", "chessusa", "2"],
    ["/partners/chessusa/3", "chessusa", "3"],
    ["/partners/chessusa/1/", "chessusa", "1"],
    ["/partners/chessusa/1/puzzles", "chessusa", "1"],
    ["/partners/chessusa/3/learn/w-london", "chessusa", "3"],
    // The spelling the links actually go out as.
    ["/partners/ChessUSA/1/puzzles", "chessusa", "1"],
    ["/PARTNERS/CHESSUSA/2", "chessusa", "2"],
    // The second advertiser, same rules, no extra machinery.
    ["/partners/chesshouse/1", "chesshouse", "1"],
    ["/partners/chesshouse/2/puzzles", "chesshouse", "2"],
    ["/partners/ChessHouse/3", "chesshouse", "3"],
    ["/partners/ChessHouse/1/learn/w-london", "chesshouse", "1"],
    ["/PARTNERS/CHESSHOUSE/2", "chesshouse", "2"],
  ])("%s activates %s option %s", (path, slug, option) => {
    expect(previewForPath(path)).toEqual({ slug, option });
  });

  it.each([
    "/",
    "/puzzles",
    "/analysis",
    "/learn",
    "/auth/age",
    // The shell and the framed route are pages, not options.
    "/partners/chessusa",
    "/partners/chessusa/live",
    // Adjacent numbers must not bleed into an option.
    "/partners/chessusa/12",
    "/partners/chessusa/1x",
    "/partners/chessusa/0",
    "/partners/chessusa/4",
    "/partners/chessusa/off",
    "/partners/chesshouse/12",
    "/partners/chesshouse/1x",
    "/partners/chesshouse/0",
    "/partners/chesshouse/4",
    // Chess House has no shell page, so the bare slug is nothing at all.
    "/partners/chesshouse",
    "/partners/chesshouse/live",
    // An advertiser not in the registry never renders, even with a
    // well-formed option: the surface is an allowlist, not a pattern.
    "/partners/chessworld/1",
    "/partners/chess/1",
    "/partners/chesshouses/1",
    "/partners/xchesshouse/1",
    // Anchoring: the prefix has to BE the route, not appear inside one.
    "/foo/partners/chessusa/1",
    "/blog/partners/chessusa/1/puzzles",
    "/partnersXchessusa/1",
    "/foo/partners/chesshouse/1",
  ])("%s shows nothing", (path) => {
    expect(previewForPath(path)).toBeNull();
  });
});

describe("the wide unit is only served where it fits", () => {
  /**
   * The wide creative is a fixed 728px IAB leaderboard inside a link whose
   * overflow is hidden, so a slot narrower than 728 does not shrink it — it
   * CUTS IT OFF, silently. At a 640px swap point that hid 120px of the unit
   * on tablet widths, which on 2a is the entire call to action.
   *
   * The swap point therefore has to clear 728 plus the narrowest side padding
   * any page puts around the slot (1rem each side).
   */
  const MIN_PAGE_PADDING = 32;

  it("swaps no earlier than the wide unit's width plus page padding", () => {
    expect(SWAP_PX).toBeGreaterThanOrEqual(SLOT_MAX_WIDTH + MIN_PAGE_PADDING);
  });

  it("uses that one swap point for the reserve as well", () => {
    // Reserve and creative must change size at the same width or the page
    // shifts by the 10px difference between the two unit heights.
    expect(partnerSlotCss).toContain(`@media (min-width:${SWAP_PX}px)`);
  });

  it("uses it for the creatives too, which is where it last drifted", () => {
    /**
     * The creatives carried their own literal 640 while PartnerBanner moved to
     * 760, so they swapped at a width the rest of the slot disagreed with.
     * Rendering them and reading the emitted media queries is the only check
     * that catches that, since nothing else links the two numbers.
     */
    const html = renderToStaticMarkup(<>{turnTwoCreative("1")}</>);
    const re = /@media \(min-width:\s*(\d+)px\)/g;
    const widths: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) widths.push(Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBe(SWAP_PX);
  });
});

describe("the Advertisement disclosure stays legible on both grounds", () => {
  /**
   * "Advertisement" is the FTC disclosure. A disclosure nobody can read is not
   * a disclosure, and this is not hypothetical: the first version hardcoded
   * white-at-55% because every surface it was tested on was dark, and it
   * measured 1.00:1 — invisible — on the white App Router pages. Contrast is
   * therefore asserted arithmetically rather than eyeballed.
   */
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = ([r, g, b]: number[]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  /** Flatten an rgba() label colour onto its opaque ground. */
  const over = (fg: number[], alpha: number, bg: number[]) =>
    fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const DARK_GROUND = [8, 9, 12]; // #08090C, the product surfaces
  const LIGHT_GROUND = [255, 255, 255]; // the App Router SEO pages

  const parse = (css: string) => {
    const n = css.match(/[\d.]+/g)!.map(Number);
    return { rgb: n.slice(0, 3), alpha: n.length > 3 ? n[3] : 1 };
  };

  it("dark tone clears 4.5:1 on the product surfaces", () => {
    const { rgb, alpha } = parse(LABEL_COLOUR.dark);
    expect(
      ratio(over(rgb, alpha, DARK_GROUND), DARK_GROUND)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("light tone clears 4.5:1 on the SEO pages", () => {
    const { rgb, alpha } = parse(LABEL_COLOUR.light);
    expect(
      ratio(over(rgb, alpha, LIGHT_GROUND), LIGHT_GROUND)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("neither tone would survive on the other's ground", () => {
    // Documents WHY the prop exists: one colour cannot serve both.
    const d = parse(LABEL_COLOUR.dark);
    const l = parse(LABEL_COLOUR.light);
    expect(
      ratio(over(d.rgb, d.alpha, LIGHT_GROUND), LIGHT_GROUND)
    ).toBeLessThan(4.5);
    expect(ratio(over(l.rgb, l.alpha, DARK_GROUND), DARK_GROUND)).toBeLessThan(
      4.5
    );
  });
});

describe("the analytics exclusion matches every spelling the routes accept", () => {
  /**
   * The rewrites and PARTNER_PATH_RE are case-insensitive, so
   * /PARTNERS/CHESSUSA/1/puzzles renders the preview. A guard that only knew
   * the lowercase spelling sent that traffic to GA4 anyway. Every exclusion
   * now goes through isPartnerPreviewPath, and the inline gtag config uses
   * the same rule as a JS string — executed here so the two cannot drift.
   */
  const cases: [string, boolean][] = [
    ["/partners/chessusa/1", true],
    ["/partners/chessusa/1/puzzles", true],
    ["/PARTNERS/CHESSUSA/1/puzzles", true],
    ["/Partners/ChessUSA/3", true],
    ["/partners/chessusa", true], // the shell is preview surface too
    ["/partners/chessusa/live", true],
    ["/puzzles", false],
    ["/", false],
    ["/partnership", false],
    ["/blog/partners/chessusa/1", false],
  ];

  it.each(cases)("isPartnerPreviewPath(%s) is %s", (path, want) => {
    expect(isPartnerPreviewPath(path)).toBe(want);
  });

  it.each(cases)("the inline gtag rule agrees on %s", (path, want) => {
    const got = new Function("location", `return ${PARTNER_PREVIEW_PATH_JS};`)({
      pathname: path,
    });
    expect(got).toBe(want);
  });
});

describe("boot script", () => {
  it("keys off the path, not off any stored state", () => {
    // A cookie or localStorage flag could outlive the preview URL and follow a
    // viewer onto real pages. The path cannot.
    expect(partnerBootScript).toContain("location.pathname");
    expect(partnerBootScript).not.toContain("cookie");
    expect(partnerBootScript).not.toContain("localStorage");
    expect(partnerBootScript).toContain("([123])");
  });

  it("returns before touching the document on a normal URL", () => {
    // The early return is what keeps a normal page load free of the webfont.
    expect(partnerBootScript).toContain("if(!m)return;");
    const returnAt = partnerBootScript.indexOf("if(!m)return;");
    expect(returnAt).toBeLessThan(partnerBootScript.indexOf("createElement"));
  });

  it("agrees with previewForPath on every URL, when actually executed", () => {
    /**
     * The rule exists twice — once as a string of JS for the document head,
     * once as TS for the component. Drift between them is a real failure
     * mode: the head would reserve height on a page the component then
     * refuses to fill, or the component would fill a box the head never
     * sized. So run the shipped script for real against a fake document and
     * compare what it decides to what the component decides.
     */
    const runBoot = (pathname: string) => {
      let attr: string | null = null;
      const appended: string[] = [];
      const doc = {
        documentElement: {
          setAttribute: (k: string, v: string) => {
            if (k === PARTNER_ATTR) attr = v;
          },
        },
        createElement: () => ({ rel: "", href: "" }),
        head: { appendChild: (el: { href: string }) => appended.push(el.href) },
      };
      new Function("location", "document", partnerBootScript)(
        { pathname },
        doc
      );
      return { attr, appended };
    };

    for (const p of [
      "/partners/chessusa/1/puzzles",
      "/partners/ChessUSA/2",
      "/partners/chessusa/3",
      "/partners/chesshouse/1/puzzles",
      "/partners/ChessHouse/2",
      "/partners/chesshouse/3",
      "/puzzles",
      "/",
      "/partners/chessusa",
      "/partners/chessusa/live",
      "/partners/chessusa/12",
      "/partners/chesshouse",
      "/partners/chesshouse/12",
      "/partners/chessworld/1",
      "/foo/partners/chessusa/1",
      "/foo/partners/chesshouse/1",
    ]) {
      const { attr, appended } = runBoot(p);
      const preview = previewForPath(p);
      expect(attr).toBe(preview ? partnerAttrValue(preview) : null);
      /**
       * The webfont must be requested on exactly the pages that show a
       * banner, and it must be THAT advertiser's. One shared stylesheet would
       * make every advertiser download every other advertiser's faces, and
       * the wrong one would silently fall back to a system face in the
       * creative the buyer is being asked to choose.
       */
      expect(appended).toEqual(
        preview ? [PARTNERS[preview.slug].fontHref] : []
      );
    }
  });

  it("cannot throw into a page that has no error handling yet", () => {
    expect(partnerBootScript).toContain("try{");
    expect(partnerBootScript).toContain("catch(e){}");
  });

  it("is syntactically valid JavaScript", () => {
    expect(() => new Function(partnerBootScript)).not.toThrow();
  });
});

describe("every advertiser's three creatives", () => {
  /**
   * These are properties of the slot rather than of one advertiser, so they
   * run across the whole registry: a second partner that broke any of them
   * would be a second partner that costs real visitors bandwidth, or that
   * ships a unit with no offer on it.
   */
  const render = (slug: (typeof PARTNER_SLUGS)[number], option: string) =>
    renderToStaticMarkup(
      <>
        {PARTNER_CREATIVES[slug](option as (typeof PARTNER_OPTION_IDS)[number])}
      </>
    );

  it.each(EVERY_UNIT)(
    "%s option %s draws its logo with CSS, never an <img>",
    (slug, option) => {
      /**
       * Load-bearing, not stylistic. All creatives are in the tree so the
       * active one can be chosen without a hydration mismatch. Browsers FETCH
       * a hidden <img>; they do not fetch a hidden background-image. Swap
       * these for <img> and every real visitor downloads every advertiser's
       * artwork on every page view in order to render none of it.
       */
      const html = render(slug, option);
      expect(html).not.toContain("<img");
      expect(html).not.toMatch(/src=["']\/img\/p\//);
      expect(html).toContain("background-image:url(/img/p/");
    }
  );

  it.each(EVERY_UNIT)(
    "%s option %s serves artwork only from paths no filter list matches",
    (slug, option) => {
      /**
       * Common ad-blocker filter lists match these substrings in a request
       * path, and artwork served from one of them simply does not render for
       * a chunk of real users — as a broken image, not a blocked one.
       * Renaming the assets "helpfully" is what this catches.
       */
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
      const html = render(slug, option);
      const seen: string[] = [];
      const re = /url\(([^)]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) seen.push(m[1].replace(/["']/g, ""));
      expect(seen.length).toBeGreaterThan(0);
      for (const path of seen) {
        expect(path.startsWith("/img/p/")).toBe(true);
        for (const needle of bait) {
          expect(path.toLowerCase()).not.toContain(needle);
        }
      }
    }
  );

  it.each(EVERY_UNIT)(
    "%s option %s carries the offer and the code",
    (slug, option) => {
      const html = render(slug, option);
      expect(html).toContain("CHESSMASTI");
      expect(html).toMatch(/5%/);
    }
  );

  it.each(EVERY_UNIT)(
    "%s option %s renders a wide unit and a narrow unit",
    (slug, option) => {
      // Both sizes ship and CSS picks one, so there is no resize flash.
      const html = render(slug, option);
      expect(html.match(/<div/g)?.length ?? 0).toBeGreaterThan(4);
    }
  );

  it.each(EVERY_UNIT)(
    "%s option %s swaps at the slot's own breakpoint",
    (slug, option) => {
      /**
       * ChessUSA's creatives once carried a literal 640 while PartnerBanner
       * moved to 760, so they swapped at a width the rest of the slot
       * disagreed with. Rendering them and reading the emitted media queries
       * is the only check that catches that, since nothing else links the
       * two numbers — and it has to run for every advertiser, because each
       * one writes its own.
       */
      const html = render(slug, option);
      const re = /@media \(min-width:\s*(\d+)px\)/g;
      const widths: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) widths.push(Number(m[1]));
      expect(widths.length).toBeGreaterThan(0);
      for (const w of widths) expect(w).toBe(SWAP_PX);
    }
  );

  it("names the advertiser and the code in every accessible label", () => {
    for (const [slug, option] of EVERY_UNIT) {
      const meta = PARTNERS[slug].options[option];
      expect(meta.alt).toContain(PARTNERS[slug].displayName);
      expect(meta.alt).toContain("CHESSMASTI");
    }
  });

  it("maps every advertiser's link numbers to the design doc's own codes", () => {
    for (const slug of PARTNER_SLUGS) {
      expect(PARTNERS[slug].options["1"].code).toBe("2a");
      expect(PARTNERS[slug].options["2"].code).toBe("2b");
      expect(PARTNERS[slug].options["3"].code).toBe("2c");
    }
  });

  it("keeps the ChessUSA module's own exports pointing at the registry", () => {
    // The shell and the framed route still import these names.
    expect(TURN_TWO_META).toBe(PARTNERS.chessusa.options);
    expect([...TURN_TWO_IDS]).toEqual([...PARTNER_OPTION_IDS]);
    expect(PARTNER_CREATIVES.chessusa).toBe(turnTwoCreative);
  });
});

describe("option guard", () => {
  it("accepts the three link ids and nothing else", () => {
    expect(isTurnTwoId("1")).toBe(true);
    expect(isTurnTwoId("2")).toBe(true);
    expect(isTurnTwoId("3")).toBe(true);
    for (const bad of ["0", "4", "2a", "", "off", undefined, null, 1, {}]) {
      expect(isTurnTwoId(bad)).toBe(false);
    }
  });
});

describe("no creative sizes an element with a bare fraction", () => {
  /**
   * MUI's sizing transform reads a bare `width`/`height` of 1 or less as a
   * FRACTION and emits `100%`. The Chess House barcode is drawn from 1-to-4px
   * bars, so its six 1px bars each rendered at the full width of the rule and
   * the barcode shipped as a solid black slab. It type-checked, passed every
   * other test in this file, and was wrong only in a browser.
   *
   * SCOPE, honestly: this catches the LITERAL spelling (`width: 1`) only. The
   * bug as actually written was `width: w` from an array, which no source
   * regex can see, and which the rendered output cannot distinguish from a
   * deliberate `width: "100%"` because both emit the same rule. The bar widths
   * are therefore pinned at the data level instead — see BARCODE_BAR_WIDTHS
   * below — and a browser on a production build remains the real check.
   *
   * Every creative module is covered, found by glob, so a new advertiser's
   * file is checked the day it lands rather than the day someone remembers.
   */
  const dir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const modules = readdirSync(dir).filter((f) => f.endsWith("Turn2.tsx"));

  it("finds the creative modules to check", () => {
    // A rename that empties this list would make every case below vacuous.
    expect(modules.length).toBeGreaterThanOrEqual(PARTNER_SLUGS.length);
  });

  it.each(modules)("%s", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    const offenders: string[] = [];
    // A bare number 0 < n <= 1 as a sizing value. `width: "1px"` (a string),
    // `width: 0` (untransformed) and `width: markWidth(h)` are all fine.
    const re =
      /\b(width|height|minWidth|maxWidth|minHeight|maxHeight):\s*(1|0?\.\d+)\s*[,}]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) offenders.push(`${m[1]}: ${m[2]}`);
    expect(offenders).toEqual([]);
  });
});

describe("the packing slip's barcode is drawn in pixels", () => {
  /**
   * The exact contract the MUI fraction bug broke. Kept at the data level
   * because that is where the conversion happens and where a regression would
   * reintroduce it: hand `sx` a bare 1 and the bar becomes the whole rule.
   */
  it("is twenty bars, each a px string", () => {
    expect(BARCODE_BAR_WIDTHS).toHaveLength(20);
    for (const w of BARCODE_BAR_WIDTHS) expect(w).toMatch(/^\d+px$/);
  });

  it("keeps every bar inside the spec's 1-4px range", () => {
    const px = BARCODE_BAR_WIDTHS.map((w) => Number(w.replace("px", "")));
    for (const w of px) {
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(4);
    }
    // 45px of bars plus 19 gaps of 2px = 83px, inside the 270px promo field.
    expect(px.reduce((a, b) => a + b, 0)).toBe(45);
  });
});
