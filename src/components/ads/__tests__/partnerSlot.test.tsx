import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SLOT_HEIGHT, SWAP_PX } from "../PartnerBanner";
import {
  LABEL_BLOCK_PX,
  PARTNER_ATTR,
  PARTNER_COOKIE,
  PARTNER_SLOT_CLASS,
  PartnerSlot,
  SLOT_MARGIN_PX,
  SLOT_RESERVE,
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

describe("boot script", () => {
  it("reads only the option cookie and only accepts the three ids", () => {
    expect(partnerBootScript).toContain(PARTNER_COOKIE);
    expect(partnerBootScript).toContain("([123])");
  });

  it("returns before touching the document when the cookie is absent", () => {
    // The early return is what keeps a normal page load free of the webfont.
    expect(partnerBootScript).toContain("if(!m)return;");
    const returnAt = partnerBootScript.indexOf("if(!m)return;");
    expect(returnAt).toBeLessThan(partnerBootScript.indexOf("createElement"));
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
