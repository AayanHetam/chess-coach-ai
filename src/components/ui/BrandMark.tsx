"use client";

import type { CSSProperties } from "react";

/**
 * The Chess Masti logo: the CM monogram with Masti's face, drawn from the
 * raster set that scripts/brand/build-logo-assets.mjs cuts from the master in
 * assets/brand/. Sources are picked by rendered size, so a 28px nav mark
 * never downloads the 512px file, and the 2x and 3x candidates keep it crisp
 * on retina screens.
 */
export interface BrandMarkProps {
  /** Rendered width and height in px. */
  size?: number;
  /** Accessible name when the mark stands alone. Decorative marks get alt="". */
  label?: string;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SOURCES = [64, 128, 256, 512] as const;

export function brandMarkSrc(px: number): string {
  const size = SOURCES.find((s) => s >= px) ?? 512;
  return `/brand/cm-mark-${size}.png`;
}

export function BrandMark({
  size = 28,
  label = "Chess Masti",
  decoding = "async",
  decorative = true,
  className,
  style,
}: BrandMarkProps & { decoding?: "async" | "sync" | "auto" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand art from /public with nothing for next/image to optimise
    <img
      src={brandMarkSrc(size)}
      srcSet={`${brandMarkSrc(size)} 1x, ${brandMarkSrc(size * 2)} 2x, ${brandMarkSrc(size * 3)} 3x`}
      width={size}
      height={size}
      alt={decorative ? "" : label}
      aria-hidden={decorative ? true : undefined}
      decoding={decoding}
      draggable={false}
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
    />
  );
}

export default BrandMark;
