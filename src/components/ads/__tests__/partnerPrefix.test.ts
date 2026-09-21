import type { NextRouter } from "next/router";
import { describe, expect, it, vi } from "vitest";

import {
  PARTNER_ATTR,
  VIEWPORT_LOCK_ATTR,
  VIEWPORT_LOCK_PROPS,
  anchorRewriteHandler,
  partnerPrefixOf,
  partnerSlotCss,
  prefixPath,
} from "../PartnerSlot";
import { patchAppRouter } from "../PartnerSlotApp";
import { patchPagesRouter, prefixedAs } from "../PartnerSlotPages";

const ORIGIN = "https://www.chessmasti.com";
const PREFIX = "/partners/ChessUSA/2";

describe("partnerPrefixOf keeps the visitor's own spelling", () => {
  it.each([
    ["/partners/ChessUSA/2/puzzles", "/partners/ChessUSA/2"],
    ["/partners/chessusa/3", "/partners/chessusa/3"],
    ["/partners/chessusa/3/", "/partners/chessusa/3"],
    ["/PARTNERS/CHESSUSA/1/learn/abc", "/PARTNERS/CHESSUSA/1"],
  ])("%s → %s", (path, prefix) => {
    expect(partnerPrefixOf(path)).toBe(prefix);
  });

  it.each([
    "/puzzles",
    "/",
    "/partners/chessusa",
    "/partners/chessusa/live",
    "/partners/chessusa/12",
    "/partners/chessusa/1x",
    "/x/partners/chessusa/1",
  ])("%s is not under a prefix", (path) => {
    expect(partnerPrefixOf(path)).toBeNull();
  });
});

describe("prefixPath", () => {
  const p = (target: string) => prefixPath(PREFIX, target, ORIGIN);

  it("prefixes same-origin absolute paths", () => {
    expect(p("/puzzles")).toBe(`${PREFIX}/puzzles`);
    expect(p("/learn/abc?tab=2#top")).toBe(`${PREFIX}/learn/abc?tab=2#top`);
  });

  it("maps the root onto the bare prefix, query and hash included", () => {
    expect(p("/")).toBe(PREFIX);
    expect(p("/?pgn=1.e4")).toBe(`${PREFIX}?pgn=1.e4`);
    expect(p("/#how")).toBe(`${PREFIX}#how`);
  });

  it("strips the site's own origin first", () => {
    expect(p(`${ORIGIN}/analysis?gameId=g1`)).toBe(
      `${PREFIX}/analysis?gameId=g1`
    );
  });

  it.each([
    "https://www.chessusa.com/", // the advertiser's own link
    "https://lichess.org/@/x",
    "//evil.example/x",
    "mailto:hi@chessmasti.com",
    "puzzles", // relative
    "?tab=2", // relative to the current page, which is already prefixed
    "#top",
    "/api/lichess/auth",
    "/_next/static/x.js",
    "/partners/chessusa",
    "/partners/chessusa/1/puzzles", // already carries a prefix
    "/partners/ChessUSA/2/puzzles",
  ])("leaves %s alone", (target) => {
    expect(p(target)).toBe(target);
  });
});

/** A stand-in for the two fields resolveHref reads, plus the two methods. */
function fakePagesRouter(pathname: string, asPath: string) {
  return {
    pathname,
    asPath,
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
  } as unknown as NextRouter;
}

describe("prefixedAs resolves every argument shape the way Next does", () => {
  const router = fakePagesRouter("/puzzles", `${PREFIX}/puzzles`);
  type Url = Parameters<typeof prefixedAs>[3];
  const as = (url: Url, asArg?: Url) =>
    prefixedAs(router, PREFIX, ORIGIN, url, asArg);

  it("a plain string", () => {
    expect(as("/plan")).toBe(`${PREFIX}/plan`);
  });

  it("a URL object with a query", () => {
    expect(as({ pathname: "/analysis", query: { gameId: "g1" } })).toBe(
      `${PREFIX}/analysis?gameId=g1`
    );
  });

  it("a dynamic pattern with an explicit as", () => {
    expect(as("/learn/[courseId]", "/learn/w-london")).toBe(
      `${PREFIX}/learn/w-london`
    );
  });

  it("a dynamic pattern interpolated from its query", () => {
    expect(
      as({
        pathname: "/learn/[courseId]",
        query: { courseId: "w-london", chapter: "3" },
      })
    ).toBe(`${PREFIX}/learn/w-london?chapter=3`);
  });

  it("the shallow replace /analysis uses to clear its query", () => {
    expect(as("/analysis", undefined)).toBe(`${PREFIX}/analysis`);
  });

  it("a query-only href, resolved against the already-prefixed asPath", () => {
    expect(as("?rating=1500")).toBe(`${PREFIX}/puzzles?rating=1500`);
  });

  it("a hash-only href likewise", () => {
    expect(as("#top")).toBe(`${PREFIX}/puzzles#top`);
  });

  it("an external URL untouched", () => {
    expect(as("https://lichess.org/x")).toBe("https://lichess.org/x");
  });
});

describe("patchPagesRouter", () => {
  it("sends the prefixed path as url AND as, and passes the options through", async () => {
    const router = fakePagesRouter("/puzzles", `${PREFIX}/puzzles`);
    const original = { push: router.push, replace: router.replace };
    const undo = patchPagesRouter(router, PREFIX, ORIGIN);

    await router.push("/plan");
    expect(original.push).toHaveBeenCalledWith(
      `${PREFIX}/plan`,
      `${PREFIX}/plan`,
      undefined
    );

    await router.replace("/puzzles", undefined, { shallow: true });
    expect(original.replace).toHaveBeenCalledWith(
      `${PREFIX}/puzzles`,
      `${PREFIX}/puzzles`,
      { shallow: true }
    );

    // A pre-resolved pattern plus `as`: Next only resolves rewrites when url
    // and as agree, so the pattern is dropped in favour of the prefixed path,
    // which the rewrite maps back onto /learn/[courseId] client-side.
    await router.push("/learn/[courseId]", "/learn/w-london", {
      scroll: false,
    });
    expect(original.push).toHaveBeenLastCalledWith(
      `${PREFIX}/learn/w-london`,
      `${PREFIX}/learn/w-london`,
      { scroll: false }
    );

    undo();
    expect(router.push).toBe(original.push);
    expect(router.replace).toBe(original.replace);
  });

  it("is installed once per router, however many slots mount", () => {
    const router = fakePagesRouter("/", PREFIX);
    const undoFirst = patchPagesRouter(router, PREFIX, ORIGIN);
    const patchedPush = router.push;
    const undoSecond = patchPagesRouter(router, PREFIX, ORIGIN);
    expect(router.push).toBe(patchedPush);
    undoSecond();
    expect(router.push).toBe(patchedPush);
    undoFirst();
    expect(router.push).not.toBe(patchedPush);
  });
});

/** A stand-in anchor: the DOM calls the handler makes, and nothing else. */
function fakeAnchor(attrs: Record<string, string>) {
  const map = new Map(Object.entries(attrs));
  return {
    getAttribute: (name: string) => map.get(name) ?? null,
    setAttribute: (name: string, value: string) => void map.set(name, value),
    hasAttribute: (name: string) => map.has(name),
    href: () => map.get("href"),
  };
}

function fakeEvent(
  type: string,
  anchor: ReturnType<typeof fakeAnchor> | null,
  extra: Record<string, unknown> = {}
) {
  return {
    type,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: { closest: () => anchor },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra,
  } as unknown as Event;
}

describe("anchorRewriteHandler", () => {
  const rewrite = anchorRewriteHandler(PREFIX, ORIGIN);

  it("rewrites an internal href as the mouse goes down, before the browser reads it", () => {
    const a = fakeAnchor({ href: "/puzzles" });
    rewrite(fakeEvent("mousedown", a));
    expect(a.href()).toBe(`${PREFIX}/puzzles`);
  });

  it("rewrites on contextmenu too, so 'copy link address' carries the prefix", () => {
    const a = fakeAnchor({ href: "/learn" });
    rewrite(fakeEvent("contextmenu", a));
    expect(a.href()).toBe(`${PREFIX}/learn`);
  });

  it.each([
    [
      "a new-tab link (the advertisement itself)",
      { href: "/x", target: "_blank" },
    ],
    ["a download", { href: "/x", download: "" }],
    ["an external link", { href: "https://lichess.org/x" }],
    ["the API", { href: "/api/lichess/auth" }],
    ["a link already under the prefix", { href: `${PREFIX}/learn` }],
  ])("leaves %s alone", (_name, attrs) => {
    const a = fakeAnchor(attrs);
    rewrite(fakeEvent("mousedown", a));
    expect(a.href()).toBe(attrs.href);
  });

  it("ignores events that are not on a link", () => {
    expect(() => rewrite(fakeEvent("click", null))).not.toThrow();
  });

  it("never takes the click itself without a navigate callback", () => {
    const a = fakeAnchor({ href: "/learn" });
    const e = fakeEvent("click", a);
    rewrite(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(a.href()).toBe(`${PREFIX}/learn`);
  });

  describe("with a navigate callback (the App Router binding)", () => {
    it("takes a plain left-click and navigates to the prefixed URL", () => {
      const navigate = vi.fn();
      const a = fakeAnchor({ href: "/faq" });
      const e = fakeEvent("click", a);
      anchorRewriteHandler(PREFIX, ORIGIN, navigate)(e);
      expect(navigate).toHaveBeenCalledWith(`${PREFIX}/faq`);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(e.stopPropagation).toHaveBeenCalled();
    });

    it.each([
      ["a cmd-click", { metaKey: true }],
      ["a ctrl-click", { ctrlKey: true }],
      ["a shift-click", { shiftKey: true }],
      ["a middle button", { button: 1 }],
      ["an already-handled click", { defaultPrevented: true }],
    ])("leaves %s to the browser, with the href rewritten", (_name, extra) => {
      const navigate = vi.fn();
      const a = fakeAnchor({ href: "/faq" });
      const e = fakeEvent("click", a, extra);
      anchorRewriteHandler(PREFIX, ORIGIN, navigate)(e);
      expect(navigate).not.toHaveBeenCalled();
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(a.href()).toBe(`${PREFIX}/faq`);
    });

    it("does not take a click on a link it did not prefix", () => {
      const navigate = vi.fn();
      const a = fakeAnchor({ href: "https://lichess.org/x" });
      const e = fakeEvent("click", a);
      anchorRewriteHandler(PREFIX, ORIGIN, navigate)(e);
      expect(navigate).not.toHaveBeenCalled();
      expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it("acts on click only, never on mousedown", () => {
      const navigate = vi.fn();
      const a = fakeAnchor({ href: "/faq" });
      anchorRewriteHandler(PREFIX, ORIGIN, navigate)(fakeEvent("mousedown", a));
      expect(navigate).not.toHaveBeenCalled();
      expect(a.href()).toBe(`${PREFIX}/faq`);
    });
  });
});

describe("patchAppRouter", () => {
  it("turns push and replace into full loads of the prefixed URL", () => {
    const router = { push: vi.fn(), replace: vi.fn() } as unknown as Parameters<
      typeof patchAppRouter
    >[0];
    const original = { push: router.push, replace: router.replace };
    const navigate = vi.fn();
    const undo = patchAppRouter(router, PREFIX, ORIGIN, navigate);

    router.push("/internship/apply/thanks");
    expect(navigate).toHaveBeenCalledWith(
      `${PREFIX}/internship/apply/thanks`,
      false
    );
    router.replace("/faq");
    expect(navigate).toHaveBeenCalledWith(`${PREFIX}/faq`, true);
    expect(original.push).not.toHaveBeenCalled();

    undo();
    expect(router.push).toBe(original.push);
    expect(router.replace).toBe(original.replace);
  });
});

describe("the viewport-locked layouts scroll under the prefix, and only there", () => {
  it("ships one rule, scoped to the html attribute", () => {
    expect(partnerSlotCss).toContain(
      `html[${PARTNER_ATTR}] [${VIEWPORT_LOCK_ATTR}]{height:auto;min-height:100dvh;overflow:visible}`
    );
    // No unscoped rule: a real visitor's /analysis must stay one screen tall.
    const unscoped = partnerSlotCss
      .split("\n")
      .filter(
        (line) =>
          line.includes(VIEWPORT_LOCK_ATTR) &&
          !line.includes(`html[${PARTNER_ATTR}]`)
      );
    expect(unscoped).toEqual([]);
  });

  it("is what the two locked roots spread onto their box", () => {
    expect(VIEWPORT_LOCK_PROPS).toEqual({ [VIEWPORT_LOCK_ATTR]: "" });
  });
});
