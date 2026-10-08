import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Masti } from "../Masti";
import { MASTI_AVATAR_ANIMATE_MIN_PX, MastiAvatar } from "../MastiAvatar";
import { MastiSays } from "../MastiSays";
import { MASTI_ALT, MASTI_MOODS, MASTI_VERSION } from "../manifest";

/**
 * The repo's vitest env is node with no jsdom, so these render through
 * react-dom/server and assert on the HTML string. That is also exactly the
 * contract that matters: what the server sends is what a crawler, a
 * reduced-motion visitor and the hydrating client see first.
 */

const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("Masti", () => {
  it.each(MASTI_MOODS)(
    "%s: server markup is the still, never the animation",
    (mood) => {
      const html = render(createElement(Masti, { mood, size: 200 }));
      expect(html).toContain(`data-masti-mood="${mood}"`);
      expect(html).toContain(`/masti/${MASTI_VERSION}/still/${mood}.webp 1x`);
      expect(html).toContain(
        `/masti/${MASTI_VERSION}/still/${mood}@2x.webp 2x`
      );
      expect(html).toContain(`src="/masti/${MASTI_VERSION}/still/${mood}.png"`);
      expect(html).not.toContain("/anim/");
      expect(html).not.toContain("data-masti-playing");
    }
  );

  it("draws a small figure from the 320px still and a big one from the 640/1122 pair", () => {
    const small = render(createElement(Masti, { mood: "wave", size: 96 }));
    expect(small).toContain(`/masti/${MASTI_VERSION}/still/wave-sm.webp`);
    expect(small).not.toContain("wave@2x.webp");
    const big = render(createElement(Masti, { mood: "wave", size: 240 }));
    expect(big).toContain(`/masti/${MASTI_VERSION}/still/wave@2x.webp 2x`);
    // A fluid figure sizes itself from its container, so it opts in.
    const fluid = render(
      createElement(Masti, { mood: "wave", size: 64, fluid: true })
    );
    expect(fluid).toContain("wave@2x.webp");
    const fluidThumb = render(
      createElement(Masti, { mood: "wave", size: 64, fluid: true, thumb: true })
    );
    expect(fluidThumb).toContain("wave-sm.webp");
  });

  it("reserves its box with explicit width and height at the 4:5 art ratio", () => {
    const html = render(createElement(Masti, { mood: "wave", size: 200 }));
    expect(html).toContain('width="200"');
    expect(html).toContain('height="250"');
    expect(html).toMatch(/width:200px;height:250px/);
  });

  it("has an accessible name by default and hides itself when decorative", () => {
    expect(render(createElement(Masti, { mood: "idea" }))).toContain(
      `alt="${MASTI_ALT.idea}"`
    );
    expect(
      render(createElement(Masti, { mood: "idea", label: "Masti has a hint" }))
    ).toContain('alt="Masti has a hint"');
    const decorative = render(
      createElement(Masti, { mood: "idea", decorative: true })
    );
    expect(decorative).toContain('alt=""');
    expect(decorative).toContain('aria-hidden="true"');
  });

  it("lazy-loads unless it is a priority placement", () => {
    expect(render(createElement(Masti, { mood: "wave" }))).toContain(
      'loading="lazy"'
    );
    const hero = render(createElement(Masti, { mood: "wave", priority: true }));
    expect(hero).toContain('loading="eager"');
    expect(hero.toLowerCase()).toContain('fetchpriority="high"');
  });
});

describe("MastiAvatar", () => {
  it("exports the size below which avatars never animate", () => {
    // The e2e and the docs rely on this number; the SSR markup cannot show
    // the effect (animation is client-only), so pin the constant itself.
    expect(MASTI_AVATAR_ANIMATE_MIN_PX).toBe(32);
  });

  it("uses the small still, never the 640px one, for a face crop", () => {
    const html = render(createElement(MastiAvatar, { mood: "idea", size: 26 }));
    expect(html).toContain(`/masti/${MASTI_VERSION}/still/idea-sm.webp`);
    expect(html).toContain(`src="/masti/${MASTI_VERSION}/still/idea-sm.png"`);
    expect(html).not.toContain("still/idea.webp");
    expect(html).not.toContain("still/idea@2x.webp");
  });

  it("crops the figure into a round window bigger than the circle", () => {
    const html = render(createElement(MastiAvatar, { mood: "wave", size: 40 }));
    expect(html).toContain('data-masti-avatar="wave"');
    expect(html).toContain("border-radius:50%");
    expect(html).toContain("overflow:hidden");
    // 40 x 2.3 = 92px figure inside a 40px circle, offset so the face is centred.
    expect(html).toContain('width="92"');
    expect(html).toContain('height="115"');
    expect(html).toMatch(/left:-\d+px;top:-\d+px/);
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("MastiSays", () => {
  it("renders the figure and a bubble with the children", () => {
    const html = render(
      createElement(MastiSays, { mood: "excited", tone: "ember" }, "Nice one!")
    );
    expect(html).toContain('data-masti-says="excited"');
    expect(html).toContain('role="note"');
    expect(html).toContain("Nice one!");
    expect(html).toContain("flex-direction:row;");
  });
  it("renders only the figure without children, which is what thinking wants", () => {
    const html = render(
      createElement(MastiSays, { mood: "thinking", side: "right" })
    );
    expect(html).toContain('data-masti-says="thinking"');
    expect(html).not.toContain('role="note"');
    expect(html).toContain("flex-direction:row-reverse");
  });
});
