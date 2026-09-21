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
  PARTNER_SLOT_CLASS,
  PartnerSlot,
  SLOT_MARGIN_PX,
  SLOT_RESERVE,
  optionForPath,
  partnerBootScript,
  partnerSlotCss,
} from "../PartnerSlot";
import {
  TURN_TWO_IDS,
  TURN_TWO_META,
  isTurnTwoId,
  turnTwoCreative,
} from "../chessusaTurn2";

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
    expect(ssr).not.toContain("chessusa.com");
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
    ["/partners/chessusa/1", "1"],
    ["/partners/chessusa/2", "2"],
    ["/partners/chessusa/3", "3"],
    ["/partners/chessusa/1/", "1"],
    ["/partners/chessusa/1/puzzles", "1"],
    ["/partners/chessusa/3/learn/w-london", "3"],
    // The spelling the links actually go out as.
    ["/partners/ChessUSA/1/puzzles", "1"],
    ["/PARTNERS/CHESSUSA/2", "2"],
  ])("%s activates option %s", (path, expected) => {
    expect(optionForPath(path)).toBe(expected);
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
    // Anchoring: the prefix has to BE the route, not appear inside one.
    "/foo/partners/chessusa/1",
    "/blog/partners/chessusa/1/puzzles",
    "/partnersXchessusa/1",
  ])("%s shows nothing", (path) => {
    expect(optionForPath(path)).toBeNull();
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

  it("agrees with optionForPath on every URL, when actually executed", () => {
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
      "/puzzles",
      "/",
      "/partners/chessusa",
      "/partners/chessusa/live",
      "/partners/chessusa/12",
      "/foo/partners/chessusa/1",
    ]) {
      const { attr, appended } = runBoot(p);
      expect(attr).toBe(optionForPath(p));
      // The webfont must be requested on exactly the pages that show a banner.
      expect(appended.length).toBe(optionForPath(p) ? 1 : 0);
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

describe("the three creatives", () => {
  it.each([...TURN_TWO_IDS])(
    "option %s draws its logo with CSS, never an <img>",
    (id) => {
      /**
       * Load-bearing, not stylistic. All three creatives are in the tree so
       * the active one can be chosen without a hydration mismatch. Browsers
       * FETCH a hidden <img>; they do not fetch a hidden background-image.
       * Swap these for <img> and every real visitor downloads ~230KB of
       * ChessUSA artwork on every page view to render nothing.
       */
      const html = renderToStaticMarkup(<>{turnTwoCreative(id)}</>);
      // No <img> element, and the path never appears as a src attribute.
      expect(html).not.toContain("<img");
      expect(html).not.toMatch(/src=["']\/img\/p\//);
      // It DOES appear, as a CSS background, which is the whole point.
      expect(html).toContain("background-image:url(/img/p/");
    }
  );

  it.each([...TURN_TWO_IDS])(
    "option %s carries the offer and the code",
    (id) => {
      const html = renderToStaticMarkup(<>{turnTwoCreative(id)}</>);
      expect(html).toContain("CHESSMASTI");
      expect(html).toMatch(/5%/);
    }
  );

  it.each([...TURN_TWO_IDS])(
    "option %s renders a wide unit and a narrow unit",
    (id) => {
      // Both sizes ship and CSS picks one, so there is no resize flash.
      const html = renderToStaticMarkup(<>{turnTwoCreative(id)}</>);
      expect(html.match(/<div/g)?.length ?? 0).toBeGreaterThan(4);
    }
  );

  it("names the advertiser in every accessible label", () => {
    for (const id of TURN_TWO_IDS) {
      expect(TURN_TWO_META[id].alt).toContain("ChessUSA");
      expect(TURN_TWO_META[id].alt).toContain("CHESSMASTI");
    }
  });

  it("maps the link numbers to the design doc's own names", () => {
    expect(TURN_TWO_META["1"].code).toBe("2a");
    expect(TURN_TWO_META["2"].code).toBe("2b");
    expect(TURN_TWO_META["3"].code).toBe("2c");
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
