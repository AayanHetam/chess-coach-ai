"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

import { SWAP_PX } from "./PartnerBanner";
import {
  PARTNER_OPTION_IDS,
  PARTNERS,
  isPartnerOptionId,
  type PartnerOptionId,
} from "./partners";

/**
 * ChessUSA Turn-2 creative, built from the design doc's three directions.
 *
 * Every colour, size, weight, letter-spacing and pixel offset here is
 * transcribed from that spec rather than eyeballed. If you change one, change
 * it there first: the advertiser is choosing between these three, and a
 * "small improvement" applied to one of them quietly breaks the comparison.
 *
 * TWO IMPLEMENTATION RULES, both load-bearing:
 *
 * 1. The logo is a CSS background-image, not an <img>. All three creatives are
 *    rendered into every page so the active one can be picked by CSS without a
 *    hydration mismatch (see PartnerSlot). A hidden <img> is still FETCHED by
 *    browsers; a background-image on a display:none element is not. That is
 *    the difference between real visitors downloading 0 bytes of ChessUSA
 *    artwork and downloading 230KB of it on every page view.
 *
 * 2. Both sizes are always in the DOM and chosen by media query at 640px, the
 *    same breakpoint PartnerBanner's <picture> uses. Rendering one and
 *    swapping on resize would need JS and would flash.
 */

/* ── palette, from the doc ──────────────────────────────────────────────── */
const GREEN = "#106834"; // their own, sampled from the logo file
const LIME = "#C7E84F";
const CYAN = "#16B8C8";
const MAGENTA = "#E24B87";
const CREAM = "#FFF8E7";
const INK = "#0C1A12";
const INK_SOFT = "#2C4A37";
const NEON_GROUND = "#071512";

const ARCHIVO = "Archivo, sans-serif";
const MONO = "'IBM Plex Mono', monospace";

/** Both logo lockups render at 45px tall; the file is 1024x220, so 209px wide. */
const LOCKUP_W = 209;
const LOCKUP_H = 45;
/** The piece mark is 222x318, shown 28px tall on the narrow units. */
const MARK_W = 20;
const MARK_H = 28;

/**
 * Derived from SWAP_PX, never hardcoded. These were literal 640s while
 * PartnerBanner's <picture> and the reserved height moved to 760, so the
 * creatives kept swapping at a width the rest of the slot no longer agreed
 * with — precisely the drift PartnerBanner's header warns about. A test now
 * asserts the two stay equal.
 */
const WIDE = `@media (min-width: ${SWAP_PX}px)`;
const NARROW = `@media (max-width: ${SWAP_PX - 0.02}px)`;

/** Shows only at >= 640px. */
function Wide({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ display: "none", [WIDE]: { display: "flex" }, ...sx }}>
      {children}
    </Box>
  );
}

/** Shows only below 640px. */
function Narrow({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ display: "flex", [WIDE]: { display: "none" }, ...sx }}>
      {children}
    </Box>
  );
}

function Logo({ src, w, h }: { src: string; w: number; h: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: w,
        height: h,
        flexShrink: 0,
        position: "relative",
        backgroundImage: `url(${src})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
    />
  );
}

/** The arrow on the SHOP NOW pills. Inline so it inherits the stroke colour. */
function Arrow({
  size,
  colour,
  weight,
}: {
  size: number;
  colour: string;
  weight: number;
}) {
  return (
    <Box
      component="svg"
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      sx={{ flexShrink: 0 }}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Box>
  );
}

/** The 45-degree checker weave behind 2c. Two offset gradients, per the spec. */
function Weave({ size }: { size: number }) {
  const c = "rgba(199,232,79,0.055)";
  const g = `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`;
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        backgroundImage: `${g}, ${g}`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `0 0, ${size / 2}px ${size / 2}px`,
      }}
    />
  );
}

/** A confetti square: 45-degree rotated, absolutely placed. 2b only. */
function Confetti({
  colour,
  size,
  ...pos
}: {
  colour: string;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        width: size,
        height: size,
        background: colour,
        transform: "rotate(45deg)",
        ...pos,
      }}
    />
  );
}

/* ═══ 2a — Board Party ══════════════════════════════════════════════════════
   Eight squares of 91px, each a different colour and each doing a job, so the
   row reads as toys rather than as a chessboard. The code lands on the
   hottest square in the row. Mobile is 4 x 80 by 2 x 50.                    */

function BoardPartyWide() {
  const cell = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return (
    <Wide
      sx={{
        width: 728,
        // Guard, not layout: the swap point already reserves 728 of room. If a
        // future padding change narrows the slot, the rank compresses evenly
        // instead of having its last squares silently clipped away.
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        display: "none",
        [WIDE]: {
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
        },
        overflow: "hidden",
      }}
    >
      <Box sx={{ ...cell, gridColumn: "1 / span 3", background: CREAM }}>
        <Logo src="/img/p/cu-lockup.png" w={LOCKUP_W} h={LOCKUP_H} />
      </Box>
      <Box sx={{ ...cell, gridColumn: 4, background: LIME }}>
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: INK,
          }}
        >
          5%
        </Box>
      </Box>
      <Box sx={{ ...cell, gridColumn: 5, background: CYAN }}>
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 19,
            lineHeight: 1,
            letterSpacing: "0.02em",
            color: INK,
          }}
        >
          OFF
        </Box>
      </Box>
      <Box
        sx={{
          ...cell,
          gridColumn: "6 / span 2",
          background: MAGENTA,
          flexDirection: "column",
          gap: "7px",
        }}
      >
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.18em",
            color: INK,
          }}
        >
          USE CODE
        </Box>
        <Box
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 18,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: INK,
          }}
        >
          CHESSMASTI
        </Box>
      </Box>
      <Box
        sx={{
          ...cell,
          gridColumn: 8,
          background: GREEN,
          flexDirection: "column",
          gap: "7px",
        }}
      >
        <Box
          aria-hidden
          sx={{ width: 7, height: 7, borderRadius: "50%", background: LIME }}
        />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.14em",
            color: CREAM,
          }}
        >
          <Box>IT&apos;S YOUR</Box>
          <Box>MOVE</Box>
        </Box>
      </Box>
    </Wide>
  );
}

function BoardPartyNarrow() {
  const cell = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "repeat(4, 80px)",
        gridTemplateRows: "50px 50px",
        overflow: "hidden",
        [WIDE]: { display: "none" },
      }}
    >
      <Box
        sx={{
          gridColumn: "1 / span 4",
          background: CREAM,
          display: "flex",
          alignItems: "center",
          gap: "11px",
          px: "14px",
        }}
      >
        <Logo src="/img/p/cu-mark.png" w={MARK_W} h={MARK_H} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 800,
              fontSize: 17,
              lineHeight: 1,
              letterSpacing: "-0.015em",
              color: GREEN,
            }}
          >
            CHESSUSA
          </Box>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: "0.12em",
              color: INK_SOFT,
            }}
          >
            AMERICA&apos;S LARGEST CHESS STORE
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          ...cell,
          gridColumn: 1,
          background: LIME,
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 19,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: INK,
          }}
        >
          5%
        </Box>
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 11,
            lineHeight: 1,
            letterSpacing: "0.06em",
            color: INK,
          }}
        >
          OFF
        </Box>
      </Box>
      <Box
        sx={{
          ...cell,
          gridColumn: "2 / span 2",
          background: MAGENTA,
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.18em",
            color: INK,
          }}
        >
          USE CODE
        </Box>
        <Box
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            letterSpacing: "0.03em",
            color: INK,
          }}
        >
          CHESSMASTI
        </Box>
      </Box>
      <Box
        sx={{
          ...cell,
          gridColumn: 4,
          background: GREEN,
          flexDirection: "column",
          gap: "5px",
        }}
      >
        <Box
          aria-hidden
          sx={{ width: 6, height: 6, borderRadius: "50%", background: LIME }}
        />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.12em",
            color: CREAM,
          }}
        >
          <Box>IT&apos;S YOUR</Box>
          <Box>MOVE</Box>
        </Box>
      </Box>
    </Narrow>
  );
}

/* ═══ 2b — Sticker ═════════════════════════════════════════════════════════
   Cream ground, rounded, confetti. Offer then code then click, left to right,
   so the eye gets a path.                                                   */

function StickerWide() {
  return (
    <Wide
      sx={{
        width: 728,
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        borderRadius: "16px",
        background: CREAM,
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        gap: "16px",
        px: "22px",
      }}
    >
      <Confetti colour={LIME} size={7} top={12} left={250} />
      <Confetti colour={CYAN} size={6} bottom={15} left={274} />
      <Confetti colour={MAGENTA} size={6} top={20} right={172} />
      <Confetti colour={GREEN} size={7} bottom={13} right={150} />

      <Logo src="/img/p/cu-lockup.png" w={LOCKUP_W} h={LOCKUP_H} />
      <Box sx={{ flex: 1 }} />

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          px: "16px",
          py: "10px",
          borderRadius: "999px",
          background: LIME,
          flexShrink: 0,
          fontFamily: ARCHIVO,
          fontWeight: 800,
          fontSize: 15,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: INK,
        }}
      >
        5% OFF
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          px: "16px",
          py: "10px",
          borderRadius: "12px",
          background: MAGENTA,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.18em",
            color: INK,
          }}
        >
          USE CODE
        </Box>
        <Box
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 17,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: INK,
          }}
        >
          CHESSMASTI
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          px: "17px",
          py: "11px",
          borderRadius: "999px",
          background: CYAN,
          flexShrink: 0,
          fontFamily: ARCHIVO,
          fontWeight: 800,
          fontSize: 11,
          lineHeight: 1,
          letterSpacing: "0.08em",
          color: INK,
        }}
      >
        SHOP NOW
        <Arrow size={12} colour={INK} weight={2.6} />
      </Box>
    </Wide>
  );
}

function StickerNarrow() {
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        borderRadius: "14px",
        background: CREAM,
        position: "relative",
        overflow: "hidden",
        p: "12px 14px",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Confetti colour={LIME} size={6} top={11} right={16} />
      <Confetti colour={CYAN} size={5} top={26} right={30} />

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Logo src="/img/p/cu-mark.png" w={MARK_W} h={MARK_H} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 800,
              fontSize: 17,
              lineHeight: 1,
              letterSpacing: "-0.015em",
              color: GREEN,
            }}
          >
            CHESSUSA
          </Box>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: "0.12em",
              color: INK_SOFT,
            }}
          >
            AMERICA&apos;S LARGEST CHESS STORE
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            px: "12px",
            py: "7px",
            borderRadius: "9px",
            background: MAGENTA,
          }}
        >
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: "0.16em",
              color: INK,
            }}
          >
            5% OFF · CODE
          </Box>
          <Box
            sx={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1,
              letterSpacing: "0.03em",
              color: INK,
            }}
          >
            CHESSMASTI
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            px: "13px",
            py: "9px",
            borderRadius: "999px",
            background: CYAN,
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: "0.07em",
            color: INK,
          }}
        >
          SHOP
          <Arrow size={11} colour={INK} weight={2.8} />
        </Box>
      </Box>
    </Narrow>
  );
}

/* ═══ 2c — Neon Board ══════════════════════════════════════════════════════
   The loud option that still respects a black page: near-black ground, the
   cream lockup, and the code on lime at 13:1.                               */

function NeonWide() {
  return (
    <Wide
      sx={{
        width: 728,
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        borderRadius: "10px",
        background: NEON_GROUND,
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        gap: "16px",
        px: "22px",
      }}
    >
      <Weave size={36} />
      <Logo src="/img/p/cu-lockup-c.png" w={LOCKUP_W} h={LOCKUP_H} />
      <Box sx={{ flex: 1 }} />

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 7,
            height: 7,
            background: MAGENTA,
            transform: "rotate(45deg)",
          }}
        />
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: 16,
            lineHeight: 1,
            letterSpacing: "0.01em",
            color: CYAN,
          }}
        >
          5% OFF
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          px: "16px",
          py: "10px",
          borderRadius: "8px",
          background: LIME,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.18em",
            color: INK,
          }}
        >
          USE CODE
        </Box>
        <Box
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 17,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: INK,
          }}
        >
          CHESSMASTI
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          px: "16px",
          py: "10px",
          borderRadius: "999px",
          border: `1.5px solid ${CREAM}`,
          flexShrink: 0,
          fontFamily: ARCHIVO,
          fontWeight: 700,
          fontSize: 10,
          lineHeight: 1,
          letterSpacing: "0.12em",
          color: CREAM,
        }}
      >
        SHOP NOW
        <Arrow size={11} colour={CREAM} weight={2.6} />
      </Box>
    </Wide>
  );
}

function NeonNarrow() {
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        borderRadius: "10px",
        background: NEON_GROUND,
        position: "relative",
        overflow: "hidden",
        p: "12px 14px",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Weave size={30} />

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Logo src="/img/p/cu-mark-c.png" w={MARK_W} h={MARK_H} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 800,
              fontSize: 17,
              lineHeight: 1,
              letterSpacing: "-0.015em",
              color: CREAM,
            }}
          >
            CHESSUSA
          </Box>
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: "0.12em",
              color: CYAN,
            }}
          >
            AMERICA&apos;S LARGEST CHESS STORE
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            px: "12px",
            py: "7px",
            borderRadius: "7px",
            background: LIME,
          }}
        >
          <Box
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: "0.16em",
              color: INK,
            }}
          >
            5% OFF · CODE
          </Box>
          <Box
            sx={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1,
              letterSpacing: "0.03em",
              color: INK,
            }}
          >
            CHESSMASTI
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            px: "12px",
            py: "8px",
            borderRadius: "999px",
            border: `1.5px solid ${CREAM}`,
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: "0.12em",
            color: CREAM,
          }}
        >
          SHOP
          <Arrow size={10} colour={CREAM} weight={2.8} />
        </Box>
      </Box>
    </Narrow>
  );
}

/* ── the three options, as the links name them ──────────────────────────── */

/**
 * The ids, the guard and the per-option metadata now live in ./partners, the
 * registry every advertiser on this surface shares. They are re-exported here
 * under their original names because the shell, the framed route and the
 * tests all import them from this module — and because a second hand-written
 * copy of "1" | "2" | "3" is exactly the drift the registry exists to stop.
 */
export type TurnTwoId = PartnerOptionId;

export const TURN_TWO_IDS: readonly TurnTwoId[] = PARTNER_OPTION_IDS;

export const isTurnTwoId = isPartnerOptionId;

export const TURN_TWO_META = PARTNERS.chessusa.options;

export function turnTwoCreative(id: TurnTwoId): ReactNode {
  switch (id) {
    case "1":
      return (
        <>
          <BoardPartyWide />
          <BoardPartyNarrow />
        </>
      );
    case "2":
      return (
        <>
          <StickerWide />
          <StickerNarrow />
        </>
      );
    case "3":
      return (
        <>
          <NeonWide />
          <NeonNarrow />
        </>
      );
  }
}
