import { describe, it, expect } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chess, type Move } from "chess.js";
import {
  makeRenderInline,
  renderMoveLinkedText,
} from "@/components/preview-analysis/moveLinker";

/**
 * The move linker, out of the coach bubble's closure and into a module:
 * the same spans, keys, titles and colours for the same prose, so the
 * transcript reads as it did, and the strip under the board can link the
 * engine's preferred move the same way.
 *
 * Node env, no jsdom: rendered with renderToStaticMarkup like the other
 * component tests.
 */

// Fixture 07: Black's 7...Qxc1 is played; 8. Qxc1 is the alternative for White.
function moves(): Move[] {
  const g = new Chess();
  for (const san of "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  ))
    g.move(san);
  return g.history({ verbose: true }) as Move[];
}

const html = (nodes: React.ReactNode[]) =>
  renderToStaticMarkup(createElement(Fragment, null, ...nodes));

describe("renderMoveLinkedText", () => {
  it("renders plain spans when there is nothing to link against", () => {
    const out = html(
      renderMoveLinkedText("You should have played 8. Qxc1 instead of 8. Nc7+.")
    );
    expect(out).toBe(
      "<span>You should have played 8. Qxc1 instead of 8. Nc7+.</span>"
    );
  });

  it("links a played move as a jump and an alternative as a preview, with the bubble's titles", () => {
    const clicks: Array<[number, string | undefined]> = [];
    const nodes = renderMoveLinkedText(
      "You should have played 8. Qxc1 instead of 8. Nc7+.",
      {
        allMoves: moves(),
        onMoveRefClick: (ply, san) => clicks.push([ply, san]),
      }
    );
    const out = html(nodes);
    expect(out).toContain(
      'title="Alternative: Qxc1 — shows the position after it"'
    );
    expect(out).toContain("🔍 8. Qxc1");
    expect(out).toContain('title="Jump to 8. Nc7+"');
    // The green of an alternative and the orange of a jump, as the bubble drew them.
    expect(out).toContain("color:#86efac");
    expect(out).toContain("color:#FB923C");
    expect(out).not.toContain("color:#FED7AA");
  });

  it("wears the user bubble's colours when asked", () => {
    const out = html(
      renderMoveLinkedText("**my move** was 8. Nc7+", {
        allMoves: moves(),
        onMoveRefClick: () => {},
        isUser: true,
      })
    );
    expect(out).toContain("color:#FED7AA");
    expect(out).toContain("my move");
  });

  it("forceRecommended treats a move with no cue as an alternative", () => {
    const quiet = html(
      renderMoveLinkedText("7. Nb5 then 7... Qxc1", {
        allMoves: moves(),
        onMoveRefClick: () => {},
      })
    );
    expect(quiet).toContain('title="Jump to 7. Nb5"');
    const forced = html(
      renderMoveLinkedText("Solution: 8. Qxc1 wins the queen", {
        allMoves: moves(),
        onMoveRefClick: () => {},
        forceRecommended: true,
      })
    );
    expect(forced).toContain("🔍 8. Qxc1");
  });

  it("bold survives beside the links", () => {
    const out = html(
      renderMoveLinkedText("**Lesson:** take the queen with 8. Qxc1.", {
        allMoves: moves(),
        onMoveRefClick: () => {},
      })
    );
    expect(out).toContain("Lesson:");
    expect(out).toContain("font-weight:700");
    expect(out).toContain("🔍 8. Qxc1");
  });

  it("accepts a bare SAN list, which is all the strip under the board holds", () => {
    const sans = moves().map((m) => ({ san: m.san }));
    const out = html(
      renderMoveLinkedText(
        "The engine preferred 8. Qxc1, which takes the queen on c1.",
        {
          allMoves: sans,
          onMoveRefClick: () => {},
        }
      )
    );
    expect(out).toContain(
      'title="Alternative: Qxc1 — shows the position after it"'
    );
  });

  it("marker: false keeps the tap and the colour but drops the glyph (the strip's sentence)", () => {
    const out = html(
      renderMoveLinkedText(
        "The engine preferred 8. Qxc1, which takes the queen on c1.",
        {
          allMoves: moves(),
          onMoveRefClick: () => {},
          marker: false,
        }
      )
    );
    expect(out).toContain(
      'title="Alternative: Qxc1 — shows the position after it"'
    );
    expect(out).toContain("color:#86efac");
    expect(out).not.toContain("🔍");
    // The words alone (emotion's SSR puts a <style> block beside the span).
    expect(
      out.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "")
    ).toBe("The engine preferred 8. Qxc1, which takes the queen on c1.");
  });

  it("makeRenderInline binds a surface's moves and handler", () => {
    const renderInline = makeRenderInline({
      allMoves: moves(),
      onMoveRefClick: () => {},
    });
    expect(html(renderInline("after 8. Nc7+ Kd8"))).toContain(
      'title="Jump to 8. Nc7+"'
    );
    expect(html(renderInline("8. Qxc1", true))).toContain("🔍 8. Qxc1");
  });
});
