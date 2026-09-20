"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

/**
 * PartnerBanner — the single partner/sponsor slot.
 *
 * Built for the ChessUSA preview at /partners/chessusa, but written as the
 * real slot rather than a mock: whatever ships live is this component with a
 * different `creative` prop.
 *
 * Two things here are requirements, not styling choices, so don't "tidy" them:
 *
 * 1. The "Advertisement" label. FTC disclosure, not decoration. It precedes
 *    the link in DOM order so a screen reader announces it before the ad, and
 *    its colour clears 4.5:1 against the site's #08090C background. A
 *    disclosure that fails contrast is not a disclosure.
 *
 * 2. The reserved box. Every creative — image or HTML, wide or narrow —
 *    occupies the SAME slot height at a given breakpoint, pinned by
 *    min-height on the container and by explicit width/height on the <img>.
 *    An ad that reflows the page when it decodes is an ad that gets blamed
 *    for the site feeling slow.
 *
 * The 640px swap point is duplicated in exactly two places, the <picture>
 * media query and SLOT_HEIGHT below. They must stay equal or the box is
 * reserved for the wrong creative across one breakpoint's width.
 */

/** Where the desktop/mobile creative swap happens. */
const SWAP_PX = 640;

/**
 * Rendered slot height per breakpoint, matching the IAB units the creative
 * is cut to: 728x90 leaderboard wide, 320x100 mobile leaderboard narrow.
 */
const SLOT_HEIGHT = { narrow: 100, wide: 90 } as const;

/** Widest the slot ever draws, so HTML creative lines up with the 728px image. */
const SLOT_MAX_WIDTH = 728;

interface ImageAsset {
  /** 1x source, e.g. /img/p/cu-w.png */
  src: string;
  /** 2x source, e.g. /img/p/cu-w@2x.png */
  src2x: string;
  /** Intrinsic 1x dimensions. Emitted as width/height attributes. */
  width: number;
  height: number;
}

export type PartnerCreative =
  | {
      kind: "image";
      /** Alt text. Describes the offer, not the file. */
      alt: string;
      /** Shown at >= 640px. */
      wide: ImageAsset;
      /** Shown below 640px, and the <img> fallback for anything older. */
      narrow: ImageAsset;
    }
  | {
      kind: "html";
      /** Accessible name for the link, since there is no <img alt>. */
      alt: string;
      node: ReactNode;
    };

export interface PartnerUtm {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export interface PartnerBannerProps {
  creative: PartnerCreative;
  /**
   * Bare destination, no UTM. The caller owns the campaign tagging via `utm`
   * so a creative can be reused across placements without editing this file.
   */
  href: string;
  utm: PartnerUtm;
  /** Advertiser name, used in the disclosure's accessible text. */
  advertiser: string;
}

/**
 * Merges UTM params onto the destination, preserving any query the advertiser
 * already put there. Returns `href` untouched if it will not parse, because a
 * dead link is a better failure than a thrown render.
 */
export function withUtm(href: string, utm: PartnerUtm): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const pairs: [string, string | undefined][] = [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_content", utm.content],
    ["utm_term", utm.term],
  ];
  for (const [key, value] of pairs) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function CreativeBody({ creative }: { creative: PartnerCreative }) {
  if (creative.kind === "html") return <>{creative.node}</>;

  const { wide, narrow, alt } = creative;
  return (
    <picture>
      <source
        media={`(min-width: ${SWAP_PX}px)`}
        srcSet={`${wide.src} 1x, ${wide.src2x} 2x`}
        width={wide.width}
        height={wide.height}
      />
      {/* eslint-disable-next-line @next/next/no-img-element --
          next/image is configured `unoptimized` here anyway, and a raw <img>
          is what keeps the width/height/srcset contract legible to whoever
          swaps in the advertiser's own file. */}
      <img
        src={narrow.src}
        srcSet={`${narrow.src} 1x, ${narrow.src2x} 2x`}
        width={narrow.width}
        height={narrow.height}
        alt={alt}
        decoding="async"
        /* Eager, not lazy: the slot is above the fold on every surface that
           mounts it, so lazy would only delay the paint it is meant to help. */
        loading="eager"
        style={{
          display: "block",
          maxWidth: "100%",
          height: "auto",
          margin: "0 auto",
        }}
      />
    </picture>
  );
}

export function PartnerBanner({
  creative,
  href,
  utm,
  advertiser,
}: PartnerBannerProps) {
  const destination = withUtm(href, utm);

  return (
    <Box
      component="aside"
      aria-label={`Advertisement from ${advertiser}`}
      sx={{
        width: "100%",
        maxWidth: SLOT_MAX_WIDTH,
        mx: "auto",
        mb: 3,
      }}
    >
      <Box
        component="p"
        sx={{
          m: 0,
          mb: 0.75,
          fontSize: "0.625rem",
          lineHeight: 1.2,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          // 0.55 alpha on #08090C measures ~5.8:1. Quieter than this reads as
          // chrome and stops being a disclosure. See the header note.
          color: "rgba(255,255,255,0.55)",
        }}
      >
        Advertisement
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // The reserved box. Both values must track SLOT_HEIGHT.
          minHeight: `${SLOT_HEIGHT.narrow}px`,
          [`@media (min-width: ${SWAP_PX}px)`]: {
            minHeight: `${SLOT_HEIGHT.wide}px`,
          },
        }}
      >
        <Box
          component="a"
          href={destination}
          target="_blank"
          rel="sponsored noopener noreferrer"
          aria-label={creative.alt}
          sx={{
            display: "block",
            width: "100%",
            textDecoration: "none",
            borderRadius: "10px",
            overflow: "hidden",
            "&:focus-visible": {
              outline: "2px solid rgba(249,115,22,0.9)",
              outlineOffset: "3px",
            },
          }}
        >
          <CreativeBody creative={creative} />
        </Box>
      </Box>
    </Box>
  );
}

export { SLOT_HEIGHT, SLOT_MAX_WIDTH, SWAP_PX };
