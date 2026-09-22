"use client";

import { useInView } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  MASTI_ALT,
  MASTI_ASPECT,
  MASTI_LOOP_MS,
  MASTI_SM_MAX_CSS_PX,
  mastiAnimSrc,
  mastiStillPng,
  mastiStillSmSrc,
  mastiStillSrcSet,
  type MastiAnimSize,
  type MastiMood,
} from "./manifest";
import { useMastiMotion } from "./useMastiMotion";

export interface MastiProps {
  mood: MastiMood;
  /** CSS width in px. Height follows the 4:5 art, so the box never shifts. */
  size?: number;
  /** Play the animation at all. Off means the still, always. */
  animated?: boolean;
  /**
   * How many loops to play before resting on the still. 0 plays until the
   * component unmounts (ambient placements only). Default 3, about 3.6 s:
   * enough to be noticed, not enough to become the page.
   */
  loops?: number;
  /** Change this value to play the loops again (a second wrong move, a new puzzle). */
  replayKey?: string | number;
  /** Hovering the figure plays it again. Fun on big placements, noise on small ones. */
  replayOnHover?: boolean;
  /** Accessible name. Defaults to a description of the mood. */
  label?: string;
  /** Purely decorative next to text that already says it: alt="" and aria-hidden. */
  decorative?: boolean;
  /** Above-the-fold placements: eager load, high fetch priority. */
  priority?: boolean;
  /** Force the 240px or 480px animation instead of picking by size. */
  variant?: "auto" | MastiAnimSize;
  /**
   * Use the 320px still instead of the 640/1122 pair. For face crops and
   * anything drawn under ~120px, where the big still is wasted bytes.
   */
  thumb?: boolean;
  /**
   * Fill the parent's width instead of a fixed pixel size (the box keeps the
   * 4:5 ratio via aspect-ratio). `size` then only picks the animation variant
   * and the intrinsic width/height attributes. For responsive placements
   * whose width comes from MUI sx breakpoints.
   */
  fluid?: boolean;
  style?: CSSProperties;
  className?: string;
  "data-testid"?: string;
}

/**
 * The mascot figure. Server-side and on first paint it is the still (WebP with
 * a PNG fallback, 2x for retina); once mounted it swaps in the animated WebP
 * for `loops` loops, then rests on the still again. Reduced-motion visitors
 * and hidden tabs never see the animation. The box is sized with inline
 * width/height so there is no layout shift when the image arrives, which
 * matters on the Pages Router where MUI sx styles do not exist before
 * hydration.
 */
export function Masti({
  mood,
  size = 120,
  animated = true,
  loops = 3,
  replayKey,
  replayOnHover = false,
  label,
  decorative = false,
  priority = false,
  variant = "auto",
  thumb = false,
  fluid = false,
  style,
  className,
  "data-testid": testId,
}: MastiProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Below-the-fold placements wait until they scroll into view, so a page
  // full of monkeys does not decode six animations nobody is looking at.
  const inView = useInView(ref, { once: true, margin: "80px" });
  const motionOk = useMastiMotion(animated) && inView;
  const [playing, setPlaying] = useState(false);
  // Bumped on every replay so the <img> remounts and the WebP restarts at
  // frame 0 (the same trick FlashOverlay uses to restart a CSS animation).
  const [round, setRound] = useState(0);
  const [hoverKey, setHoverKey] = useState(0);
  // A burst that has finished stays finished: coming back to the tab must
  // not replay every mascot on the page. Keyed on what defines a burst.
  const burstKey = `${mood}|${String(replayKey)}|${hoverKey}`;
  const doneBurst = useRef<string | null>(null);

  const height = Math.round(size / MASTI_ASPECT);
  const animSize: MastiAnimSize =
    variant === "auto" ? (size <= MASTI_SM_MAX_CSS_PX ? "sm" : "lg") : variant;

  useEffect(() => {
    if (!motionOk) {
      setPlaying(false);
      return;
    }
    if (doneBurst.current === burstKey) return;
    // Fetch the animation before showing it. Swapping the still for a source
    // that has not arrived leaves an empty box for the length of the download
    // and burns the loop timer on nothing; a warmed cache makes the swap
    // instant and the timer honest.
    let cancelled = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pre = new Image();
    const start = () => {
      // A cached image is `complete` synchronously AND still fires `load`;
      // without this guard the burst starts twice and the first timer is
      // orphaned, cutting the next replay short.
      if (cancelled || started) return;
      started = true;
      setPlaying(true);
      setRound((r) => r + 1);
      if (!loops || !Number.isFinite(loops) || loops <= 0) return;
      timer = setTimeout(
        () => {
          doneBurst.current = burstKey;
          setPlaying(false);
        },
        loops * MASTI_LOOP_MS[mood] + 80
      );
    };
    pre.onload = start;
    // A failed fetch keeps the still; nothing to do.
    pre.onerror = () => undefined;
    pre.src = mastiAnimSrc(mood, animSize);
    if (pre.complete && pre.naturalWidth > 0) start();
    return () => {
      cancelled = true;
      pre.onload = null;
      if (timer) clearTimeout(timer);
    };
  }, [motionOk, mood, loops, burstKey, animSize]);

  const onMouseEnter = useCallback(() => {
    if (replayOnHover) setHoverKey((k) => k + 1);
  }, [replayOnHover]);

  const alt = decorative ? "" : (label ?? MASTI_ALT[mood]);
  const stillSrcSet = thumb
    ? mastiStillSmSrc(mood, "webp")
    : mastiStillSrcSet(mood);
  const stillPng = thumb ? mastiStillSmSrc(mood, "png") : mastiStillPng(mood);
  const imgStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
    pointerEvents: "none",
  };

  return (
    <span
      ref={ref}
      className={className}
      data-testid={testId}
      data-masti-mood={mood}
      data-masti-playing={playing ? "" : undefined}
      aria-hidden={decorative ? true : undefined}
      onMouseEnter={replayOnHover ? onMouseEnter : undefined}
      style={{
        display: fluid ? "block" : "inline-block",
        position: "relative",
        width: fluid ? "100%" : size,
        height: fluid ? "auto" : height,
        aspectRatio: fluid ? "4 / 5" : undefined,
        flexShrink: 0,
        lineHeight: 0,
        ...style,
      }}
    >
      {playing ? (
        <picture key={`anim-${round}`}>
          <source type="image/webp" srcSet={mastiAnimSrc(mood, animSize)} />
          {/* eslint-disable-next-line @next/next/no-img-element -- static
              mascot art from /public; next/image has nothing to optimise
              here and would strip the animation. */}
          <img
            src={stillPng}
            alt={alt}
            width={size}
            height={height}
            decoding="async"
            draggable={false}
            style={imgStyle}
          />
        </picture>
      ) : (
        <picture>
          <source type="image/webp" srcSet={stillSrcSet} />
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={stillPng}
            alt={alt}
            width={size}
            height={height}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            // Lowercase on purpose: React 18 does not know the camel-cased
            // prop and warns; the DOM attribute is case-insensitive either way.
            {...(priority
              ? ({ fetchpriority: "high" } as Record<string, string>)
              : {})}
            draggable={false}
            style={imgStyle}
          />
        </picture>
      )}
    </span>
  );
}

export default Masti;
