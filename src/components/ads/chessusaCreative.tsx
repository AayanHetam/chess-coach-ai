"use client";

import { Box } from "@mui/material";
import type { PartnerCreative, PartnerUtm } from "./PartnerBanner";
import { SWAP_PX } from "./PartnerBanner";
import type { VariantId } from "./previewOptions";

/**
 * The three ChessUSA creative variants the preview at /partners/chessusa
 * cycles through with ?v=.
 *
 * TWO THINGS ARE PLACEHOLDER AND BOTH ARE MARKED:
 *
 * 1. The image pair (`three`) is INTERIM creative sized to the right IAB
 *    units so the <picture> path, the srcset and the reserved box all verify
 *    for real in this branch. TODO: the reproducible next/og render of the
 *    final Design creative lands on its own branch. It is deliberately not
 *    here — satori supports a CSS subset (flex only, no grid, partial
 *    gradients) and wants fonts as ArrayBuffers, and which of those
 *    constraints bite is unknowable until the final creative exists.
 *
 * 2. The HTML copy below is our mock-up of a ChessUSA unit, not copy ChessUSA
 *    supplied. It exists so the layout, the slot height and the disclosure
 *    can be judged at real breakpoints. Swap in their words before anything
 *    goes live.
 */

/** Bare destination. UTM is applied by PartnerBanner from the prop below. */
export const CHESSUSA_HREF = "https://www.chessusa.com/";

export function chessusaUtm(variant: VariantId): PartnerUtm {
  return {
    source: "chessmasti",
    medium: "display",
    campaign: "chessusa_2026q3",
    content: variant,
  };
}

/** Media query string for the creative swap. Kept as one literal so the
 *  sx key, the <picture> media attribute and the reserved box cannot drift. */
const WIDE = `@media (min-width: ${SWAP_PX}px)`;

/**
 * Shared frame: fills the reserved slot exactly, and stacks below the swap
 * point where the unit is 320x100 rather than 728x90.
 */
function frameSx(justify: "center" | "space-between") {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: justify,
    gap: 1.5,
    width: "100%",
    height: "100px",
    px: 2,
    py: 1,
    boxSizing: "border-box",
    textAlign: "left",
    flexDirection: "column",
    [WIDE]: {
      height: "90px",
      flexDirection: "row",
      justifyContent: "space-between",
      px: 3,
    },
  } as const;
}

/* ── editorial ──────────────────────────────────────────────────────────────
   Quiet, typographic, sits with the site rather than shouting over it. The
   argument for it: on a dark product surface the restrained unit is the one
   that still reads as editorial rather than as an ad block to scroll past. */
function EditorialCreative() {
  return (
    <Box
      sx={{
        ...frameSx("center"),
        background:
          "linear-gradient(135deg, rgba(20,22,28,0.95) 0%, rgba(28,24,20,0.95) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "10px",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          ChessUSA
        </Box>
        <Box
          sx={{
            fontSize: { xs: "0.95rem", sm: "1.15rem" },
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            mt: 0.25,
          }}
        >
          Tournament boards, sets and clocks
        </Box>
      </Box>
      <Box
        sx={{
          flexShrink: 0,
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "rgba(255,255,255,0.72)",
          borderBottom: "1px solid rgba(255,255,255,0.28)",
          pb: 0.25,
        }}
      >
        Shop the range
      </Box>
    </Box>
  );
}

/* ── bold ───────────────────────────────────────────────────────────────────
   High contrast, brand-forward, a real CTA pill. The argument for it: it is
   unmissable, and an advertiser paying for a slot usually wants the unit that
   is obviously an offer. Shown next to editorial so the tradeoff is visible
   rather than argued about. */
function BoldCreative() {
  return (
    <Box
      sx={{
        ...frameSx("space-between"),
        background:
          "linear-gradient(120deg, #10233F 0%, #1B3A6B 55%, #24509A 100%)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "10px",
        color: "#FFFFFF",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            fontSize: "0.6rem",
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          ChessUSA
        </Box>
        <Box
          sx={{
            fontSize: { xs: "1.05rem", sm: "1.35rem" },
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            mt: 0.25,
          }}
        >
          Gear up for your next tournament
        </Box>
      </Box>
      <Box
        sx={{
          flexShrink: 0,
          px: 2.5,
          py: 1,
          borderRadius: "999px",
          background: "#FFFFFF",
          color: "#10233F",
          fontWeight: 800,
          fontSize: "0.84rem",
          whiteSpace: "nowrap",
        }}
      >
        Shop now
      </Box>
    </Box>
  );
}

/* ── three ──────────────────────────────────────────────────────────────────
   The image pair. This is the variant that exercises <picture>, the 1x/2x
   srcset and the 640px source swap, because the advertiser's own file will
   arrive as PNG and that path does not ship untested. See the TODO up top. */
const IMAGE_CREATIVE: PartnerCreative = {
  kind: "image",
  alt: "ChessUSA — tournament chess boards, sets and clocks. Shop the range.",
  wide: {
    src: "/img/p/cu-w.png",
    src2x: "/img/p/cu-w@2x.png",
    width: 728,
    height: 90,
  },
  narrow: {
    src: "/img/p/cu-n.png",
    src2x: "/img/p/cu-n@2x.png",
    width: 320,
    height: 100,
  },
};

export function chessusaCreative(variant: VariantId): PartnerCreative {
  switch (variant) {
    case "editorial":
      return {
        kind: "html",
        alt: "ChessUSA — tournament boards, sets and clocks. Shop the range.",
        node: <EditorialCreative />,
      };
    case "bold":
      return {
        kind: "html",
        alt: "ChessUSA — gear up for your next tournament. Shop now.",
        node: <BoldCreative />,
      };
    case "three":
      return IMAGE_CREATIVE;
  }
}
