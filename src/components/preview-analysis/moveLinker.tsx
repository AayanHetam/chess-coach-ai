/**
 * The move linker: prose in, prose with tappable moves out.
 *
 * Every move the coach writes in notation ("24. Rxd4", "8... Kd8", "Move 3:
 * Nxd4") becomes a span the reader can tap: a move the game played there
 * jumps the board to it, a move that could have been played loads onto the
 * board as an exploration preview. Bold (**…**) is rendered on the way.
 *
 * Until 2026-10-07 this lived as a closure inside the coach bubble, which
 * meant only text the bubble rendered could carry tappable moves: the
 * transcript, the key-moment headers and the proof lines, but not the strip
 * under the board, the Lines view or the exploring row. Now it is a function
 * any surface can call. The spans, their keys, titles and styles are the
 * bubble's, byte for byte; the four consumers that took the bubble's
 * closure as a function prop keep taking one.
 *
 * `findAllMoveRefs` and `resolveMoveRef` (coachMoveRefs.ts) decide what a
 * reference is and where it points; this module only draws the answer.
 */
import React from "react";
import { Box } from "@mui/material";
import type { Move } from "chess.js";
import { findAllMoveRefs, resolveMoveRef } from "./coachMoveRefs";

export interface MoveLinkerOptions {
  /** Full move history; without it (or a click handler) the text is plain. */
  allMoves?: ReadonlyArray<Pick<Move, "san">>;
  /** Starting FEN when the game was not loaded from the standard position (legality checks for move links). */
  rootFen?: string;
  /**
   * Fired when the reader taps a move reference. `playSan` is set for an
   * alternative (green): the parent replays to `ply` and plays `playSan`
   * on the board as an exploration preview.
   */
  onMoveRefClick?: (ply: number, playSan?: string) => void;
  /** The user's own bubble wears warmer colours. */
  isUser?: boolean;
  /**
   * Pre-mark every move ref as recommended, bypassing the contextBefore
   * regex check. Structured-card content like `SOLUTION: 7. dxe5 wins the
   * pawn` never has "best was" / "should have" in its lookback window.
   */
  forceRecommended?: boolean;
  /**
   * Prefix an alternative with the 🔍 glyph, as the coach bubble does
   * (default). A sentence that already says what the move is ("The engine
   * preferred 8. Qxc1") passes false and keeps only the colour and the tap.
   */
  marker?: boolean;
}

/** `renderInline`'s shape: the signature the card components take as a prop. */
export type RenderInline = (
  text: string,
  forceRecommended?: boolean
) => React.ReactNode[];

/**
 * Render `text` as React nodes with bold and tappable move references.
 */
export function renderMoveLinkedText(
  text: string,
  opts: MoveLinkerOptions = {}
): React.ReactNode[] {
  const {
    allMoves,
    rootFen,
    onMoveRefClick,
    isUser = false,
    forceRecommended = false,
    marker = true,
  } = opts;
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  const out: React.ReactNode[] = [];
  boldParts.forEach((part, boldIdx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      out.push(
        <Box
          key={`b${boldIdx}`}
          component="span"
          sx={{
            fontWeight: 700,
            color: isUser ? "#FED7AA" : "#FB923C",
          }}
        >
          {part.slice(2, -2)}
        </Box>
      );
      return;
    }
    // G7: production-parity 4-tier move-reference parser. Each match is
    // styled either as "recommended" (green, click → explore the
    // alternative) or "navigate" (orange, click → jump to that ply).
    if (!allMoves || !onMoveRefClick) {
      out.push(<span key={`t${boldIdx}`}>{part}</span>);
      return;
    }
    const refs = findAllMoveRefs(part, forceRecommended);
    if (refs.length === 0) {
      out.push(<span key={`t${boldIdx}`}>{part}</span>);
      return;
    }
    let lastIdx = 0;
    for (const ref of refs) {
      if (ref.start > lastIdx) {
        out.push(
          <span key={`${boldIdx}t${lastIdx}`}>
            {part.slice(lastIdx, ref.start)}
          </span>
        );
      }
      // Founder bug 2026-09-05: "you should have played 7.Qxe7" linked to
      // the game's 8.Qxe7. The link now follows what the click will DO
      // (resolveMoveRef): a move played exactly where the coach says is a
      // jump; a move that is legal at that position but was not played
      // there is an alternative and loads onto the board as a preview,
      // however the prose was worded; only a move that is illegal there
      // (a real move-number typo) falls back to the nearby-ply window.
      const resolution = resolveMoveRef(allMoves as Move[], ref, rootFen);
      if (resolution) {
        const hypothetical = resolution.kind === "hypothetical";
        const ply = hypothetical ? resolution.anchorPly : resolution.ply;
        const playSan = hypothetical ? resolution.san : undefined;
        const recColor = "#86efac"; // light green for an alternative to explore
        const navColor = isUser ? "#FED7AA" : "#FB923C";
        out.push(
          <Box
            key={`${boldIdx}m${ref.start}`}
            component="span"
            onClick={() => onMoveRefClick(ply, playSan)}
            title={
              hypothetical
                ? `Alternative: ${ref.san} — shows the position after it`
                : `Jump to ${ref.moveNumber}${
                    ref.isBlack ? "..." : "."
                  } ${ref.san}`
            }
            sx={{
              color: hypothetical ? recColor : navColor,
              cursor: "pointer",
              fontWeight: 700,
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: hypothetical
                ? "rgba(134,239,172,0.5)"
                : isUser
                  ? "rgba(254,215,170,0.5)"
                  : "rgba(251,146,60,0.5)",
              px: 0.35,
              borderRadius: "3px",
              transition: "all 140ms ease",
              "&:hover": {
                textDecorationStyle: "solid",
                background: hypothetical
                  ? "rgba(34,197,94,0.16)"
                  : isUser
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(249,115,22,0.14)",
              },
            }}
          >
            {hypothetical && marker ? "🔍 " : ""}
            {ref.full}
          </Box>
        );
      } else {
        out.push(<span key={`${boldIdx}m${ref.start}`}>{ref.full}</span>);
      }
      lastIdx = ref.end;
    }
    if (lastIdx < part.length) {
      out.push(
        <span key={`${boldIdx}t${lastIdx}end`}>{part.slice(lastIdx)}</span>
      );
    }
  });
  return out;
}

/** A `renderInline` bound to one surface's moves and click handler. */
export function makeRenderInline(
  opts: Omit<MoveLinkerOptions, "forceRecommended">
): RenderInline {
  return (text, forceRecommended = false) =>
    renderMoveLinkedText(text, { ...opts, forceRecommended });
}
