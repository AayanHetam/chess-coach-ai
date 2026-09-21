import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SLOT_HEIGHT, SWAP_PX } from "../PartnerBanner";
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
  const ssr = renderToStaticMarkup(<PartnerSlot />);

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

  it("puts both heights into the pre-paint CSS, swapping at the same 640px", () => {
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
