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
import { AEO_TOKENS } from "../../../app/_seo/aeoUi";
import {
  APP_DARK_GROUND,
  LABEL_BLOCK_PX,
  LIVE_EXCLUDED_RE,
  PAGE_SHELL_CLASS,
  PARTNER_ATTR,
  PARTNER_SLOT_APP_CLASS,
  SLOT_TONE_ATTR,
  PARTNER_CREATIVES,
  PARTNER_SLOT_CLASS,
  PREVIEW_ATTR,
  PartnerSlot,
  PARTNER_PREVIEW_PATH_JS,
  SLOT_MARGIN_PX,
  SLOT_RESERVE,
  buildPartnerBootScript,
  isPartnerPreviewPath,
  partnerBootScript,
  partnerFontFaceCss,
  partnerSlotCss,
  placementForPath,
  previewForPath,
} from "../PartnerSlot";
import {
  TURN_TWO_IDS,
  TURN_TWO_META,
  isTurnTwoId,
  turnTwoCreative,
} from "../chessusaTurn2";
import {
  LIVE_PLACEMENT,
  PARTNERS,
  PARTNER_FONT_DIR,
  PARTNER_FONT_FACES,
  PARTNER_OPTION_IDS,
  PARTNER_SLUGS,
  partnerAttrValue,
  partnerFontUrl,
  type PartnerFontFace,
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

describe("the slot server-renders empty for everyone", () => {
  /**
   * renderToStaticMarkup runs no effects, so this is exactly what the server
   * sends and what every browser parses first. A banner here would be in the
   * static HTML of every page, preview prefix or not, live placement or not,
   * and would hydrate-mismatch the moment the URL disagreed. The banner only
   * ever appears after mount, into a box the head CSS already sized.
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
   * previewForPath is the PREVIEW resolver: the URLs that put a visitor into
   * an advertiser's walkthrough, with the sign-in asks hidden, the router
   * patched and analytics off. Every case that must return null is a case
   * where a real visitor would otherwise land in someone's demo. Who sees a
   * banner at all is placementForPath's call, under "the live placement".
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

/** What the boot script appends to <head>: a font preload, or it is a bug. */
interface FakeLink {
  rel: string;
  as: string;
  type: string;
  crossOrigin: string;
  href: string;
}

/**
 * Runs a boot script for real against a fake document and reports what it
 * decided: the banner attribute, whether the preview attribute was set, and
 * the hrefs it preloaded. Every appended element is checked here to be a
 * well-formed font preload, so the per-path tests only have to say which
 * files; `links` carries the raw elements for anything finer.
 */
function runBoot(script: string, pathname: string) {
  let attr: string | null = null;
  let preview = false;
  const links: FakeLink[] = [];
  const doc = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        if (k === PARTNER_ATTR) attr = v;
        if (k === PREVIEW_ATTR) preview = true;
      },
    },
    createElement: (): FakeLink => ({
      rel: "",
      as: "",
      type: "",
      crossOrigin: "",
      href: "",
    }),
    head: { appendChild: (el: FakeLink) => links.push(el) },
  };
  new Function("location", "document", script)({ pathname }, doc);
  for (const l of links) {
    expect(l.rel).toBe("preload");
    expect(l.as).toBe("font");
    expect(l.type).toBe("font/woff2");
    // Mandatory even same-origin: fonts are fetched in CORS mode, and a
    // preload in the other mode is a second download, not a cache hit.
    expect(l.crossOrigin).toBe("anonymous");
    expect(l.href.startsWith(`${PARTNER_FONT_DIR}/`)).toBe(true);
  }
  return { attr, preview, preloaded: links.map((l) => l.href) };
}

/** The files a partner's banner needs, as the boot script should name them. */
const fontUrls = (slug: keyof typeof PARTNERS) =>
  PARTNERS[slug].fonts.map((face) => partnerFontUrl(face));

describe("the live placement", () => {
  it("is ChessUSA unit 2b, bought 2026-10-14", () => {
    // Pinned on purpose. Changing what every visitor sees on every page is a
    // decision, and this is the test that makes an accidental edit loud.
    expect(LIVE_PLACEMENT).toEqual({ slug: "chessusa", option: "2" });
  });

  it("shows on every ordinary page and nowhere the surface excludes", () => {
    const live = { slug: "chessusa", option: "2" } as const;
    for (const p of [
      "/",
      "/puzzles",
      "/learn/w-london",
      "/faq",
      "/analysis?x=1",
      "/PUZZLES",
    ]) {
      expect(placementForPath(p.split("?")[0], live)).toEqual(live);
    }
    for (const p of [
      "/auth/age",
      "/auth/age/",
      "/partners/chessusa",
      "/partners/chessusa/live",
      "/partners/ChessUSA/",
      "/partners/chesshouse",
      "/partners/anything/at/all",
      // Internal tools: nobody is paying to be seen on a dashboard.
      "/intern",
      "/intern/submissions",
      "/admin/cost",
      "/ADMIN/intern-data",
      // A one-shot token flow, kept free of chrome.
      "/reset-password",
      "/reset-password/",
    ]) {
      expect(placementForPath(p, live)).toBeNull();
      expect(LIVE_EXCLUDED_RE.test(p)).toBe(true);
    }
    // A path that merely starts with the same letters is ordinary.
    expect(placementForPath("/auth/agent", live)).toEqual(live);
    expect(placementForPath("/partnerships", live)).toEqual(live);
    expect(placementForPath("/internship", live)).toEqual(live);
    expect(placementForPath("/administrator", live)).toEqual(live);
    expect(placementForPath("/reset-passwords", live)).toEqual(live);
  });

  it("yields to the preview a prefix names, whoever is live", () => {
    const live = { slug: "chessusa", option: "2" } as const;
    expect(placementForPath("/partners/ChessHouse/1/puzzles", live)).toEqual({
      slug: "chesshouse",
      option: "1",
    });
    expect(placementForPath("/partners/chessusa/3", live)).toEqual({
      slug: "chessusa",
      option: "3",
    });
  });

  it("is exactly the preview resolver when nothing is live", () => {
    for (const p of [
      "/",
      "/puzzles",
      "/auth/age",
      "/partners/chessusa/1",
      "/partners/chesshouse/2/learn",
      "/partners/chessusa/live",
    ]) {
      expect(placementForPath(p, null)).toEqual(previewForPath(p));
    }
  });

  it("sets the banner attribute for everyone and the preview attribute only under a prefix", () => {
    const script = buildPartnerBootScript({ slug: "chessusa", option: "2" });
    expect(runBoot(script, "/puzzles")).toEqual({
      attr: "chessusa:2",
      preview: false,
      preloaded: fontUrls("chessusa"),
    });
    expect(runBoot(script, "/partners/ChessHouse/1/puzzles")).toEqual({
      attr: "chesshouse:1",
      preview: true,
      preloaded: fontUrls("chesshouse"),
    });
    expect(runBoot(script, "/auth/age")).toEqual({
      attr: null,
      preview: false,
      preloaded: [],
    });
    expect(runBoot(script, "/partners/chessusa/live")).toEqual({
      attr: null,
      preview: false,
      preloaded: [],
    });
  });

  it("cannot hide a real visitor's sign-in asks, because that rule never keys on the banner attribute", () => {
    const signInRules = partnerSlotCss
      .split("\n")
      .filter((l) => l.includes("data-cm-sign-in"));
    expect(signInRules.length).toBeGreaterThan(0);
    for (const rule of signInRules) {
      expect(rule).toContain(`html[${PREVIEW_ATTR}]`);
      expect(rule).not.toContain(`html[${PARTNER_ATTR}]`);
    }
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

  it("without a live placement, returns before touching the document on a normal URL", () => {
    // The early return is what keeps a normal page load free of any face
    // whenever nothing is live.
    const dormant = buildPartnerBootScript(null);
    expect(dormant).toContain("if(!L||");
    expect(dormant.indexOf("return")).toBeLessThan(
      dormant.indexOf("createElement")
    );
    expect(runBoot(dormant, "/puzzles")).toEqual({
      attr: null,
      preview: false,
      preloaded: [],
    });
  });

  it("agrees with placementForPath and previewForPath on every URL, when actually executed", () => {
    /**
     * The rule exists twice — once as a string of JS for the document head,
     * once as TS for the component. Drift between them is a real failure
     * mode: the head would reserve height on a page the component then
     * refuses to fill, or the component would fill a box the head never
     * sized. So run the shipped script for real against a fake document and
     * compare what it decides to what the component decides.
     */
    for (const p of [
      "/puzzles",
      "/",
      "/learn/w-london",
      "/faq",
      "/auth/age",
      "/auth/age/",
      "/auth/agent",
      "/intern",
      "/intern/submissions",
      "/internship",
      "/admin/cost",
      "/administrator",
      "/reset-password",
      "/reset-passwords",
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
      for (const live of [
        null,
        LIVE_PLACEMENT,
        { slug: "chesshouse", option: "3" } as const,
      ]) {
        const { attr, preview, preloaded } = runBoot(
          buildPartnerBootScript(live),
          p
        );
        const placement = placementForPath(p, live);
        expect(attr).toBe(placement ? partnerAttrValue(placement) : null);
        // The preview attribute follows the URL alone, never the live placement.
        expect(preview).toBe(previewForPath(p) !== null);
        /**
         * The faces must be preloaded on exactly the pages that show a
         * banner, and they must be THAT advertiser's. Preloading the whole
         * registry would make every advertiser download every other
         * advertiser's faces, and the wrong set would leave the creative the
         * buyer is being asked to choose in a fallback face until the real
         * one arrived.
         */
        expect(preloaded).toEqual(placement ? fontUrls(placement.slug) : []);
      }
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

describe("the App Router mount takes its page's ground", () => {
  /**
   * The App Router pages render on a white body and paint their own ground.
   * Without these rules the live banner sat in a white band above every dark
   * SEO page. The wrapper's ground follows the page, and so does the label
   * tone (PartnerSlotApp reads the same .cm-page-shell signal after mount
   * and stamps it on the wrapper, so browsers without :has() agree too).
   */
  it("is white like the body by default, dark from the first frame under a PageShell", () => {
    expect(partnerSlotCss).toContain(
      `html[${PARTNER_ATTR}] .${PARTNER_SLOT_APP_CLASS}{background:#fff;padding:0 16px}`
    );
    expect(partnerSlotCss).toContain(
      `html[${PARTNER_ATTR}] body:has(.${PAGE_SHELL_CLASS}) .${PARTNER_SLOT_APP_CLASS}{background:${APP_DARK_GROUND}}`
    );
  });

  it("follows the tone the binding stamps after mount, with or without :has()", () => {
    const lines = partnerSlotCss.split("\n");
    const has = lines.findIndex((l) => l.includes(":has("));
    const light = lines.findIndex((l) =>
      l.includes(`[${SLOT_TONE_ATTR}="light"]{background:#fff}`)
    );
    const dark = lines.findIndex((l) =>
      l.includes(`[${SLOT_TONE_ATTR}="dark"]{background:${APP_DARK_GROUND}}`)
    );
    expect(has).toBeGreaterThan(-1);
    // Same specificity as the :has rule and later in the sheet, so the
    // post-mount stamp wins wherever the two disagree.
    expect(light).toBeGreaterThan(has);
    expect(dark).toBeGreaterThan(has);
    for (const i of [light, dark]) {
      expect(lines[i].startsWith(`html[${PARTNER_ATTR}] body .`)).toBe(true);
    }
  });

  it("repeats the PageShell colour and class exactly", () => {
    expect(APP_DARK_GROUND).toBe(AEO_TOKENS.bg);
    const here = fileURLToPath(new URL(".", import.meta.url));
    const shell = readFileSync(
      join(here, "..", "..", "..", "app", "_seo", "aeoUi.tsx"),
      "utf8"
    );
    expect(shell).toContain(`className="${PAGE_SHELL_CLASS}"`);
  });

  it("paints nothing for a visitor with no banner", () => {
    const rules = partnerSlotCss
      .split("\n")
      .filter((l) => l.includes(PARTNER_SLOT_APP_CLASS));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules)
      expect(rule.startsWith(`html[${PARTNER_ATTR}]`)).toBe(true);
  });
});

describe("the faces come from this domain", () => {
  /**
   * The placement is live for every visitor, so the creatives' typefaces are
   * served from chessmasti.com rather than linked from Google: a page load
   * must not call a third party on the advertiser's behalf. These tests hold
   * the whole chain — the file is in the repo, the CSS declares it, the boot
   * script preloads it, and nothing anywhere still points at Google.
   */
  const here = fileURLToPath(new URL(".", import.meta.url));
  const publicDir = join(here, "..", "..", "..", "..", "public");

  it.each(PARTNER_FONT_FACES.map((f) => [f.file, f] as const))(
    `%s is a woff2 file shipped under public${PARTNER_FONT_DIR}`,
    (file, face) => {
      const bytes = readFileSync(join(publicDir, PARTNER_FONT_DIR, file));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(face.family.length).toBeGreaterThan(0);
      expect(face.weight).toMatch(/^[1-9]00( [1-9]00)?$/);
    }
  );

  it("declares one @font-face per file, swapped, pointing at that file", () => {
    const rules = partnerFontFaceCss.split("\n");
    expect(rules).toHaveLength(PARTNER_FONT_FACES.length);
    PARTNER_FONT_FACES.forEach((face, i) => {
      expect(rules[i]).toContain(`font-family:'${face.family}'`);
      expect(rules[i]).toContain(`font-weight:${face.weight}`);
      expect(rules[i]).toContain("font-display:swap");
      expect(rules[i]).toContain(
        `src:url(${partnerFontUrl(face)}) format('woff2')`
      );
    });
    // And they ship in the head CSS, before any slot rule.
    expect(partnerSlotCss.startsWith(partnerFontFaceCss)).toBe(true);
    // Each file once, however many partners share it.
    const files = PARTNER_FONT_FACES.map((f) => f.file);
    expect(new Set(files).size).toBe(files.length);
  });

  /**
   * Every (family, weight) a creative sets text in, read from the Emotion
   * rule blocks in the rendered markup. A block with no font-weight inherits
   * one, so its weight is unknown here and only the family is checked.
   */
  const facesIn = (html: string): { family: string; weight: number | null }[] =>
    Array.from(html.matchAll(/\{([^{}]*font-family:[^{}]*)\}/g), (m) => {
      const block = m[1];
      const family = /font-family:([^;}]+)/
        .exec(block)![1]
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, "");
      const w = /font-weight:(\d+)/.exec(block);
      return { family, weight: w ? Number(w[1]) : null };
    });

  const covers = (
    face: PartnerFontFace,
    family: string,
    weight: number | null
  ) => {
    if (face.family !== family) return false;
    if (weight === null) return true;
    const [lo, hi = lo] = face.weight.split(" ").map(Number);
    return weight >= lo && weight <= hi;
  };

  it("every face a creative sets text in is served, at that weight", () => {
    for (const [slug, option] of EVERY_UNIT) {
      const html = renderToStaticMarkup(<>{PARTNER_CREATIVES[slug](option)}</>);
      const faces = facesIn(html);
      expect(faces.length).toBeGreaterThan(0);
      for (const { family, weight } of faces) {
        expect(
          PARTNER_FONT_FACES.some((f) => covers(f, family, weight)),
          `${slug} option ${option} sets text in ${family} ${weight ?? "(inherited weight)"}, which no partner font serves`
        ).toBe(true);
      }
    }
  });

  it("a partner lists every face its creatives use, and only those", () => {
    for (const slug of PARTNER_SLUGS) {
      const used: { family: string; weight: number | null }[] = [];
      for (const option of PARTNER_OPTION_IDS) {
        const html = renderToStaticMarkup(
          <>{PARTNER_CREATIVES[slug](option)}</>
        );
        used.push(...facesIn(html));
      }
      const listed = PARTNERS[slug].fonts;
      // Everything used is listed (so the boot script preloads it)...
      for (const { family, weight } of used) {
        expect(
          listed.some((f) => covers(f, family, weight)),
          `${slug} uses ${family} ${weight ?? ""} but does not list it`
        ).toBe(true);
      }
      // ...and everything listed is used (so no partner preloads a face it
      // never renders).
      for (const face of listed) {
        expect(
          used.some((u) => covers(face, u.family, u.weight)),
          `${slug} lists ${face.file} but no creative uses it`
        ).toBe(true);
      }
    }
  });

  it("the live unit alone uses every face its partner lists, so no visitor preloads a face the banner never renders", () => {
    /**
     * The boot script preloads a partner's whole list, not the one unit's
     * faces, which is harmless on a sales preview and a waste on every page
     * view once that partner is live. ChessUSA's three units all use both
     * listed faces; this is the test that fails the day a placement does
     * not, before it ships to every visitor.
     */
    if (!LIVE_PLACEMENT) return;
    const html = renderToStaticMarkup(
      <>{PARTNER_CREATIVES[LIVE_PLACEMENT.slug](LIVE_PLACEMENT.option)}</>
    );
    const used = facesIn(html);
    for (const face of PARTNERS[LIVE_PLACEMENT.slug].fonts) {
      expect(
        used.some((u) => covers(face, u.family, u.weight)),
        `the live unit never sets text in ${face.file}, yet every visitor preloads it`
      ).toBe(true);
    }
  });

  it("nothing on the surface still points at Google Fonts", () => {
    expect(partnerSlotCss).not.toMatch(/googleapis|gstatic/);
    expect(partnerBootScript).not.toMatch(/googleapis|gstatic|stylesheet/);
    const adsDir = join(here, "..");
    const sources = readdirSync(adsDir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => readFileSync(join(adsDir, f), "utf8"));
    sources.push(
      readFileSync(
        join(
          here,
          "..",
          "..",
          "..",
          "pages",
          "partners",
          "chessusa",
          "live.tsx"
        ),
        "utf8"
      )
    );
    for (const src of sources)
      expect(src).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
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
