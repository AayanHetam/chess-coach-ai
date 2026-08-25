"use client";

import { useEffect, useState } from "react";
import type { ChartedPerf, RatingPoint } from "./ratingHistory";

/**
 * Shared client for GET /api/ratings/history.
 *
 * Two components on /plan need this response now — the trend panels and the
 * goal setter's per-control prefills. The endpoint has no server-side cache
 * and the Chess.com path fans out to monthly archive fetches, so two mounts
 * firing two requests doubles real upstream work. One in-flight/settled
 * promise per window keeps it to one request per page visit.
 */

export interface HistoryTrend {
  perf: ChartedPerf;
  points: RatingPoint[];
  current?: number;
  delta?: number;
  platform: "lichess" | "chesscom";
}

export type HistoryResponse =
  | {
      status: "ok";
      platform: string;
      username: string;
      windowDays: number;
      trends: HistoryTrend[];
    }
  | { status: "no_username"; trends: [] }
  | { status: "unavailable"; message: string; trends: [] };

const UNAVAILABLE: HistoryResponse = {
  status: "unavailable",
  message: "Couldn't load your rating history.",
  trends: [],
};

const inflight = new Map<number, Promise<HistoryResponse>>();

function fetchHistory(windowDays: number): Promise<HistoryResponse> {
  const existing = inflight.get(windowDays);
  if (existing) return existing;
  const p = (async (): Promise<HistoryResponse> => {
    try {
      const res = await fetch(`/api/ratings/history?window=${windowDays}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as HistoryResponse;
    } catch {
      // A failure must not be memoised for the rest of the session — the next
      // mount (or a retry after sign-in) deserves a fresh attempt.
      inflight.delete(windowDays);
      return UNAVAILABLE;
    }
  })();
  inflight.set(windowDays, p);
  return p;
}

export function useRatingHistory(windowDays: number): {
  data: HistoryResponse | null;
  loading: boolean;
} {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchHistory(windowDays).then((json) => {
      if (cancelled) return;
      setData(json);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  return { data, loading };
}
