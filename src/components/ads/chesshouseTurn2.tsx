"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

import { SWAP_PX } from "./PartnerBanner";
import { PARTNERS, type PartnerOptionId } from "./partners";

/**
 * Chess House Turn-2 creative, built from the design doc's three directions.
 *
 * Every colour, size, weight, letter-spacing and pixel offset here is
 * transcribed from that spec rather than eyeballed. If you change one, change
 * it there first: the advertiser is choosing between these three, and a
 * "small improvement" applied to one of them quietly breaks the comparison.
 *
 * A FILE PER ADVERTISER, on purpose. The layout helpers below are near-twins
 * of the ones in chessusaTurn2.tsx and could be shared. They are not, because
 * the property that matters most on this surface is that editing one
 * advertiser's units can never alter another's — ChessUSA's links are live in
 * a pitch while these are being cut. Shared helpers would make every tweak
 * here a change to their creative too.
 *
 * TWO IMPLEMENTATION RULES, both load-bearing:
 *
 * 1. The logo is a CSS background-image, not an <img>. All three creatives are
 *    rendered into every page so the active one can be picked by CSS without a
 *    hydration mismatch (see PartnerSlot). A hidden <img> is still FETCHED by
 *    browsers; a background-image on a display:none element is not.
 *
 * 2. Both sizes are always in the DOM and chosen by media query at SWAP_PX,
 *    the same breakpoint PartnerBanner reserves height at. Rendering one and
 *    swapping on resize would need JS and would flash.
 */

/* ── palette, sampled from the mark rather than invented ────────────────── */
/** The logo's own two inks. Everything else is derived from them. */
const BLUE = "#285888";
const CYAN = "#0088C8";
const CYAN_LIGHT = "#5FC4EE";
/** CTA cyan on the dark ground: 10.5:1, where CYAN_LIGHT alone is not enough. */
const CYAN_CTA = "#6FC9F0";
/** The reversed mark's body colour, and the cream the dark unit is set in. */
const CREAM = "#EFE7D8";
/** Warmer cream, used only as the 2b code block's fill and its wordmark. */
const CREAM_WARM = "#FFFBF0";
/** Label stock for the packing slip. */
const STOCK = "#E8E6E0";
/** 2a's ground: darker than the page so the unit reads as a lit room in it. */
const NIGHT = "#0B0D11";
/** 2c's inks. 14.3:1 and 5.0:1 on the stock. */
const INK = "#14181C";
const INK_SOFT = "#5A6168";
/** 2b's "5% OFF · CODE" sits on cream, not on the blue. */
const CODE_LABEL_INK = "#4A5560";
/** 2b's descriptor on the blue ground: 5.0:1. */
const DESCRIPTOR = "#BCD8F0";

const ARCHIVO = "Archivo, sans-serif";
const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Source Serif 4', Georgia, serif";

/**
 * The mark is portrait — 148x188, aspect 0.787 — and carries no wordmark, so
 * it sets the cap height of the lockup and the name is always set in type.
 * Width is derived rather than written down twice: the spec says "height N,
 * width auto", and a background-image needs a box with both.
 */
const MARK_ASPECT = 148 / 188;
const markWidth = (height: number) => Number((height * MARK_ASPECT).toFixed(2));

/** Original inks, for the one ground light enough to take them (2c). */
const MARK = "/img/p/ch-mark.png";
/** Cream knockout, for the dark and blue grounds (2a, 2b). */
const MARK_REV = "/img/p/ch-mark-c.png";

/**
 * Derived from SWAP_PX, never hardcoded — the drift this guards against is
 * documented in PartnerBanner and asserted by partnerSlot.test.tsx.
 */
const WIDE = `@media (min-width: ${SWAP_PX}px)`;

/** Shows only at and above SWAP_PX. */
function Wide({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ display: "none", [WIDE]: { display: "flex" }, ...sx }}>
      {children}
    </Box>
  );
}

/** Shows only below SWAP_PX. */
function Narrow({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ display: "flex", [WIDE]: { display: "none" }, ...sx }}>
      {children}
    </Box>
  );
}

/** The mark, drawn at a given height. See rule 1 above for why it is a background. */
function Mark({
  src,
  height,
  sx,
}: {
  src: string;
  height: number;
  sx?: object;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: markWidth(height),
        height,
        flexShrink: 0,
        backgroundImage: `url(${src})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        ...sx,
      }}
    />
  );
}

/** The arrow on the CTAs. Inline so it inherits the stroke colour. */
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

/* ═══ 2a — Threshold ════════════════════════════════════════════════════════
   The logo's own cyan swoosh is re-cast as light spilling under a door along
   the bottom edge, so the unit reads as a lit room inside the dark page and
   the brand's most distinctive graphic does the integrating.               */

/** The glow and its hairline. Insets differ between the two sizes. */
function ThresholdGlow({ height, inset }: { height: number; inset: number }) {
  return (
    <>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height,
          background:
            "linear-gradient(to top, rgba(0,136,200,0.22), transparent)",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: inset,
          right: inset,
          bottom: 0,
          height: "1px",
          background: `linear-gradient(to right, transparent, ${CYAN_LIGHT}, transparent)`,
        }}
      />
    </>
  );
}

function ThresholdWide() {
  return (
    <Wide
      sx={{
        width: 728,
        // Guard, not layout: the swap point already reserves 728 of room. If a
        // future padding change narrows the slot, the row compresses instead
        // of having its CTA silently clipped away.
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        borderRadius: "14px",
        background: NIGHT,
        border: "1px solid rgba(255,255,255,0.09)",
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        px: "20px",
      }}
    >
      <ThresholdGlow height={46} inset={20} />
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          width: "100%",
        }}
      >
        <Mark src={MARK_REV} height={58} />
        <Box
          aria-hidden
          sx={{
            width: "1px",
            height: 44,
            background: "rgba(255,255,255,0.10)",
            flexShrink: 0,
          }}
        />
        <Box sx={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: "22px",
              lineHeight: 1,
              letterSpacing: "-0.005em",
              color: CREAM,
            }}
          >
            CHESS HOUSE
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: "9px",
              lineHeight: 1,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.62)",
            }}
          >
            CHESS IN EVERY HOME
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "8px 13px",
            borderRadius: "7px",
            border: "1px solid rgba(239,231,216,0.32)",
            background: "rgba(239,231,216,0.07)",
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: "9px",
              lineHeight: 1,
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.62)",
            }}
          >
            5% OFF · CODE
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: "15px",
              lineHeight: 1,
              letterSpacing: "0.06em",
              color: CREAM,
            }}
          >
            CHESSMASTI
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "9px 15px",
            borderRadius: "999px",
            border: "1px solid rgba(95,196,238,0.55)",
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: "10px",
              lineHeight: 1,
              letterSpacing: "0.10em",
              color: CYAN_CTA,
            }}
          >
            SHOP CHESS SETS
          </Box>
          <Arrow size={11} colour={CYAN_CTA} weight={2.4} />
        </Box>
      </Box>
    </Wide>
  );
}

function ThresholdNarrow() {
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        borderRadius: "12px",
        background: NIGHT,
        border: "1px solid rgba(255,255,255,0.09)",
        position: "relative",
        overflow: "hidden",
        padding: "11px 13px",
        alignItems: "center",
        gap: "11px",
      }}
    >
      <ThresholdGlow height={42} inset={13} />
      <Mark src={MARK_REV} height={48} sx={{ position: "relative" }} />
      <Box
        aria-hidden
        sx={{
          position: "relative",
          width: "1px",
          alignSelf: "stretch",
          background: "rgba(255,255,255,0.10)",
          flexShrink: 0,
        }}
      />
      <Box
        sx={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: "16px",
              lineHeight: 1,
              letterSpacing: "-0.005em",
              color: CREAM,
            }}
          >
            CHESS HOUSE
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: "9px",
              lineHeight: 1,
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.62)",
            }}
          >
            CHESS IN EVERY HOME
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "stretch", gap: "8px" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "3px",
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(239,231,216,0.32)",
              background: "rgba(239,231,216,0.07)",
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: ARCHIVO,
                fontWeight: 700,
                fontSize: "9px",
                lineHeight: 1,
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.62)",
              }}
            >
              5% OFF · CODE
            </Box>
            <Box
              component="span"
              sx={{
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: "14px",
                lineHeight: 1,
                letterSpacing: "0.05em",
                color: CREAM,
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
              padding: "0 11px",
              borderRadius: "999px",
              border: "1px solid rgba(95,196,238,0.55)",
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: ARCHIVO,
                fontWeight: 600,
                fontSize: "9px",
                lineHeight: 1,
                letterSpacing: "0.12em",
                color: CYAN_CTA,
              }}
            >
              SHOP SETS
            </Box>
            <Arrow size={10} colour={CYAN_CTA} weight={2.6} />
          </Box>
        </Box>
      </Box>
    </Narrow>
  );
}

/* ═══ 2b — Swoosh ═══════════════════════════════════════════════════════════
   The whole artboard becomes the logo's blue field with its swoosh enlarged
   to full width, so the unit pops off the dark page using nothing but Chess
   House's own two inks — and the one cream block on it is the code.        */

/** The tapered ribbons. The wide unit adds an upper counter-sweep. */
function Swoosh({ wide }: { wide: boolean }) {
  return (
    <Box
      component="svg"
      aria-hidden
      width={wide ? 728 : 320}
      height={wide ? 90 : 100}
      viewBox={wide ? "0 0 728 90" : "0 0 320 100"}
      sx={{ position: "absolute", inset: 0 }}
    >
      {wide ? (
        <>
          <path
            d="M0 74 Q170 40 392 55 Q580 67 728 34 L728 44 Q580 78 392 65 Q170 50 0 82 Z"
            fill={CYAN_LIGHT}
            opacity="0.5"
          />
          <path
            d="M0 20 Q210 -4 420 12 L420 17 Q210 2 0 25 Z"
            fill={CYAN}
            opacity="0.45"
          />
        </>
      ) : (
        <path
          d="M0 80 Q90 52 186 64 Q262 73 320 46 L320 56 Q262 84 186 74 Q90 62 0 89 Z"
          fill={CYAN_LIGHT}
          opacity="0.5"
        />
      )}
    </Box>
  );
}

function SwooshWide() {
  return (
    <Wide
      sx={{
        width: 728,
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        borderRadius: "6px",
        background: BLUE,
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        gap: "18px",
        px: "22px",
      }}
    >
      <Swoosh wide />
      <Mark src={MARK_REV} height={58} sx={{ position: "relative" }} />
      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Box
          component="span"
          sx={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: "27px",
            lineHeight: 1,
            letterSpacing: "-0.005em",
            color: CREAM_WARM,
          }}
        >
          CHESS HOUSE
        </Box>
        <Box
          component="span"
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 600,
            fontSize: "9px",
            lineHeight: 1,
            letterSpacing: "0.18em",
            color: DESCRIPTOR,
          }}
        >
          ESTABLISHED 1972
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          padding: "10px 15px",
          borderRadius: "4px",
          background: CREAM_WARM,
          flexShrink: 0,
        }}
      >
        <Box
          component="span"
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: "9px",
            lineHeight: 1,
            letterSpacing: "0.14em",
            color: CODE_LABEL_INK,
          }}
        >
          5% OFF · CODE
        </Box>
        <Box
          component="span"
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: "16px",
            lineHeight: 1,
            letterSpacing: "0.05em",
            color: BLUE,
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
          gap: "6px",
          paddingBottom: "4px",
          borderBottom: `2px solid ${CYAN_LIGHT}`,
          flexShrink: 0,
        }}
      >
        <Box
          component="span"
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: "11px",
            lineHeight: 1,
            letterSpacing: "0.10em",
            color: CREAM_WARM,
          }}
        >
          SHOP NOW
        </Box>
        <Arrow size={12} colour={CREAM_WARM} weight={2.6} />
      </Box>
    </Wide>
  );
}

function SwooshNarrow() {
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        borderRadius: "6px",
        background: BLUE,
        position: "relative",
        overflow: "hidden",
        padding: "11px 13px",
        alignItems: "center",
        gap: "11px",
      }}
    >
      <Swoosh wide={false} />
      <Mark src={MARK_REV} height={48} sx={{ position: "relative" }} />
      <Box
        sx={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Box
            component="span"
            sx={{
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: "18px",
              lineHeight: 1,
              letterSpacing: "-0.005em",
              color: CREAM_WARM,
            }}
          >
            CHESS HOUSE
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 600,
              fontSize: "9px",
              lineHeight: 1,
              letterSpacing: "0.14em",
              color: DESCRIPTOR,
            }}
          >
            ESTABLISHED 1972
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              padding: "6px 10px",
              borderRadius: "3px",
              background: CREAM_WARM,
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: ARCHIVO,
                fontWeight: 700,
                fontSize: "9px",
                lineHeight: 1,
                letterSpacing: "0.14em",
                color: CODE_LABEL_INK,
              }}
            >
              5% OFF · CODE
            </Box>
            <Box
              component="span"
              sx={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: "14px",
                lineHeight: 1,
                letterSpacing: "0.04em",
                color: BLUE,
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
              paddingBottom: "3px",
              borderBottom: `2px solid ${CYAN_LIGHT}`,
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: ARCHIVO,
                fontWeight: 700,
                fontSize: "10px",
                lineHeight: 1,
                letterSpacing: "0.09em",
                color: CREAM_WARM,
              }}
            >
              SHOP NOW
            </Box>
            <Arrow size={11} colour={CREAM_WARM} weight={2.6} />
          </Box>
        </Box>
      </Box>
    </Narrow>
  );
}

/* ═══ 2c — Packing Slip ═════════════════════════════════════════════════════
   Chess House began in 1972 as mail order and still ships boxes to homes, so
   the unit becomes a shipping label — a format whose entire job is displaying
   a code, which makes CHESSMASTI the hero by structural logic rather than by
   volume. Brand blue and cyan run the top edge as courier tape.            */

/** Field labels and the descriptor: the small monospace caps on the stock. */
function SlipLabel({
  children,
  tracking,
}: {
  children: ReactNode;
  tracking: string;
}) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: MONO,
        fontWeight: 600,
        fontSize: "9px",
        lineHeight: 1,
        letterSpacing: tracking,
        color: INK_SOFT,
      }}
    >
      {children}
    </Box>
  );
}

/** A perforated rule between two label fields. 1px of width, 1px of border. */
function Perforation() {
  return (
    <Box
      aria-hidden
      sx={{
        width: "1px",
        borderLeft: "1px dashed rgba(20,24,28,0.30)",
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Wide unit only. Twenty bars, 1–4px wide, 2px gaps, 9px tall.
 *
 * The widths are converted to px STRINGS here rather than handed to `sx` as
 * numbers, and that is load-bearing rather than style. MUI's sizing transform
 * reads a bare `width` of 1 or less as a FRACTION and emits `100%`, so the six
 * 1px bars each rendered at the full width of the rule and the barcode shipped
 * as a solid black slab. It type-checked and passed every unit test; a browser
 * on a production build is what caught it.
 *
 * Exported because the conversion IS the fix: partnerSlot.test.tsx asserts
 * every entry is a px string, which a `width: w` regression would fail.
 */
const BARCODE = [3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 1, 3, 2];

export const BARCODE_BAR_WIDTHS: readonly string[] = BARCODE.map(
  (w) => `${w}px`
);

function Barcode() {
  return (
    <Box
      aria-hidden
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: "2px",
        height: "9px",
      }}
    >
      {BARCODE_BAR_WIDTHS.map((w, i) => (
        <Box key={i} sx={{ width: w, height: "9px", background: INK }} />
      ))}
    </Box>
  );
}

function PackingSlipWide() {
  return (
    <Wide
      sx={{
        width: 728,
        maxWidth: "100%",
        height: 90,
        boxSizing: "border-box",
        // Square corners: a shipping label has none.
        background: STOCK,
        position: "relative",
        overflow: "hidden",
        alignItems: "stretch",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          background: BLUE,
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: 5,
          left: 0,
          right: 0,
          height: 2,
          background: CYAN,
        }}
      />
      <Box
        sx={{
          width: 112,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "7px",
        }}
      >
        <Mark src={MARK} height={58} />
      </Box>
      <Perforation />
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "7px",
          padding: "7px 0 0 18px",
        }}
      >
        <SlipLabel tracking="0.20em">SHIPPED FROM</SlipLabel>
        <Box
          component="span"
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 800,
            fontSize: "20px",
            lineHeight: 1,
            letterSpacing: "-0.01em",
            color: INK,
          }}
        >
          CHESS HOUSE
        </Box>
        <SlipLabel tracking="0.14em">MAIL ORDER SINCE 1972</SlipLabel>
      </Box>
      <Perforation />
      <Box
        sx={{
          boxSizing: "border-box",
          width: 270,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "6px",
          padding: "7px 0 0 18px",
        }}
      >
        <SlipLabel tracking="0.20em">PROMO CODE · 5% OFF</SlipLabel>
        <Box
          component="span"
          sx={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: "21px",
            lineHeight: 1,
            letterSpacing: "0.03em",
            color: INK,
          }}
        >
          CHESSMASTI
        </Box>
        <Barcode />
      </Box>
      <Box
        sx={{
          width: 132,
          flexShrink: 0,
          background: BLUE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          paddingTop: "7px",
        }}
      >
        <Box
          aria-hidden
          sx={{ width: 34, height: 2, background: CYAN_LIGHT }}
        />
        <Box
          component="span"
          sx={{
            fontFamily: ARCHIVO,
            fontWeight: 700,
            fontSize: "10px",
            lineHeight: 1,
            letterSpacing: "0.14em",
            color: "#FFFFFF",
          }}
        >
          OPEN THE BOX
        </Box>
        <Box
          aria-hidden
          sx={{ width: 34, height: 2, background: CYAN_LIGHT }}
        />
      </Box>
    </Wide>
  );
}

function PackingSlipNarrow() {
  return (
    <Narrow
      sx={{
        width: 320,
        maxWidth: "100%",
        height: 100,
        boxSizing: "border-box",
        background: STOCK,
        position: "relative",
        overflow: "hidden",
        flexDirection: "column",
      }}
    >
      <Box aria-hidden sx={{ height: 5, background: BLUE, flexShrink: 0 }} />
      <Box aria-hidden sx={{ height: 2, background: CYAN, flexShrink: 0 }} />
      <Box sx={{ flex: 1, display: "flex", alignItems: "stretch" }}>
        {/* The logo becomes a full-height field; the barcode rule is dropped. */}
        <Box
          sx={{
            width: 58,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Mark src={MARK} height={52} />
        </Box>
        <Perforation />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "7px",
            paddingLeft: "11px",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <Box
              component="span"
              sx={{
                fontFamily: ARCHIVO,
                fontWeight: 800,
                fontSize: "15px",
                lineHeight: 1,
                letterSpacing: "-0.01em",
                color: INK,
              }}
            >
              CHESS HOUSE
            </Box>
            <SlipLabel tracking="0.12em">MAIL ORDER SINCE 1972</SlipLabel>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <SlipLabel tracking="0.16em">PROMO · 5% OFF</SlipLabel>
            <Box
              component="span"
              sx={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: "18px",
                lineHeight: 1,
                letterSpacing: "0.02em",
                color: INK,
              }}
            >
              CHESSMASTI
            </Box>
          </Box>
        </Box>
        <Box
          sx={{
            width: 86,
            flexShrink: 0,
            background: BLUE,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <Box
            aria-hidden
            sx={{ width: 26, height: 2, background: CYAN_LIGHT }}
          />
          <Box
            component="span"
            sx={{
              fontFamily: ARCHIVO,
              fontWeight: 700,
              fontSize: "9px",
              lineHeight: 1,
              letterSpacing: "0.12em",
              color: "#FFFFFF",
            }}
          >
            OPEN THE BOX
          </Box>
          <Box
            aria-hidden
            sx={{ width: 26, height: 2, background: CYAN_LIGHT }}
          />
        </Box>
      </Box>
    </Narrow>
  );
}

/* ── the three options, as the links name them ──────────────────────────── */

/** Codes, names and accessible labels live in the registry, not here. */
export const CHESSHOUSE_META = PARTNERS.chesshouse.options;

export function chesshouseCreative(id: PartnerOptionId): ReactNode {
  switch (id) {
    case "1":
      return (
        <>
          <ThresholdWide />
          <ThresholdNarrow />
        </>
      );
    case "2":
      return (
        <>
          <SwooshWide />
          <SwooshNarrow />
        </>
      );
    case "3":
      return (
        <>
          <PackingSlipWide />
          <PackingSlipNarrow />
        </>
      );
  }
}
