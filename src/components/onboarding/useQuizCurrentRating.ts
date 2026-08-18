"use client";

import { useEffect, useRef, useState } from "react";
import {
  derivedRating,
  usesPlatformPath,
  type QuizAnswers,
} from "./quizConfig";

/**
 * The visitor's current rating, for anchoring the goal projection.
 *
 * Two sources, deliberately in this order:
 *
 *  1. Platform branch — their real rating, read live from Lichess / Chess.com
 *     via /api/ratings/preview. This is the whole reason that endpoint exists:
 *     a projection from a made-up starting point is worth nothing.
 *  2. Self-assessment branch — the representative rating the quiz derives from
 *     their own answers. Coarse, and labelled as such by the caller.
 *
 * When neither is available the hook returns `undefined`, NOT a default. The
 * picker shows an unanchored estimate in that case rather than projecting from
 * a fabricated 1500 — the same rule the rest of the rating pipeline follows.
 */

export type QuizRatingStatus =
  | "idle"
  | "loading"
  | "ok"
  | "self_assessed"
  | "not_found"
  | "no_established_rating"
  | "unavailable";

export interface QuizRating {
  currentRating?: number;
  status: QuizRatingStatus;
  /** Platform's own number, for display. */
  rawRating?: number;
  platform?: "lichess" | "chesscom";
  perf?: string;
}

export function useQuizCurrentRating(answers: QuizAnswers): QuizRating {
  const [state, setState] = useState<QuizRating>({ status: "idle" });
  // Keyed so switching platform or correcting a typo re-fetches, but simply
  // re-rendering does not.
  const lastKeyRef = useRef<string | null>(null);

  const platform = usesPlatformPath(answers.playStyle)
    ? (answers.playStyle as "lichess" | "chesscom")
    : null;
  const username = answers.username?.trim() ?? "";
  const key = platform ? `${platform}:${username.toLowerCase()}` : "";

  useEffect(() => {
    if (!platform || username.length < 2) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const res = await fetch("/api/ratings/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, username }),
        });
        const data = (await res.json()) as {
          status: string;
          rating?: number;
          rawRating?: number;
          platform?: "lichess" | "chesscom";
          perf?: string;
        };
        if (cancelled) return;

        if (data.status === "ok" && typeof data.rating === "number") {
          setState({
            status: "ok",
            currentRating: data.rating,
            rawRating: data.rawRating,
            platform: data.platform,
            perf: data.perf,
          });
        } else if (data.status === "not_found") {
          setState({ status: "not_found" });
        } else if (data.status === "no_established_rating") {
          setState({ status: "no_established_rating" });
        } else {
          setState({ status: "unavailable" });
        }
      } catch {
        if (!cancelled) setState({ status: "unavailable" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [platform, username, key]);

  if (platform) return state;

  // Self-assessment branch: the quiz already derives a representative rating.
  const derived = derivedRating(answers);
  if (typeof derived === "number") {
    return { currentRating: derived, status: "self_assessed" };
  }
  return { status: "idle" };
}
