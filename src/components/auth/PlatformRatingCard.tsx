"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "We found your account" card for the Profile → Chess tab.
 *
 * Replaces asking the user to type a rating they will guess at. They give us a
 * username (which they know exactly); we read the real rating off the platform.
 *
 * Design note: we show EVERY established rating we found, not just the one the
 * coach calibrates on. The moment that lands with a user is recognition — "it
 * knows my blitz AND my rapid" — and showing the full picture also makes the
 * single calibration number legible instead of mysterious.
 */

interface PerfRow {
  perf: string;
  rating: number;
  games: number;
}
interface SourceRow {
  platform: "lichess" | "chesscom";
  username: string;
  perfs: PerfRow[];
}

type LookupResult =
  | { status: "ok"; rating: number; rawRating: number; platform: string; perf: string; games: number; all: SourceRow[] }
  | { status: "cached"; rating: number; rawRating?: number; platform?: string; perf?: string }
  | { status: "no_username"; message: string }
  | { status: "no_established_rating"; message: string; inspected: SourceRow[] }
  | { status: "unavailable"; message: string };

const PLATFORM_LABEL: Record<string, string> = {
  lichess: "Lichess",
  chesscom: "Chess.com",
};

/** Refresh in the background once the stored value is older than this. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export default function PlatformRatingCard() {
  const { profile, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRanRef = useRef(false);

  const hasUsername = !!(profile?.lichessUsername?.trim() || profile?.chesscomUsername?.trim());

  const lookup = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/ratings/lookup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
        const data = (await res.json()) as LookupResult;
        setResult(data);
        if (data.status === "ok") await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed.");
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  // Auto-refresh a stale value once per mount. Non-forced, so the server's TTL
  // is the real gate and a user opening this dialog repeatedly costs nothing.
  useEffect(() => {
    if (autoRanRef.current || !profile || !hasUsername) return;
    const age = Date.now() - (profile.platformRatingFetchedAt ?? 0);
    if (profile.platformRating && age < STALE_AFTER_MS) return;
    autoRanRef.current = true;
    void lookup(false);
  }, [profile, hasUsername, lookup]);

  const storedRating = profile?.platformRatingRaw ?? profile?.platformRating;
  const storedPlatform = profile?.platformRatingSource;
  const storedPerf = profile?.platformRatingPerf;

  const found = result?.status === "ok" ? result : null;
  const allSources = found?.all ?? (result?.status === "no_established_rating" ? result.inspected : []);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        background: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.22)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "grey.100" }}>
          Your rating
        </Typography>
        {busy && <CircularProgress size={14} />}
      </Stack>

      <Typography variant="caption" sx={{ color: "grey.400", display: "block", mb: 1.5 }}>
        Pulled straight from your account — no need to guess.
      </Typography>

      {/* Current stored value, so the card says something before any fetch. */}
      {storedRating != null && !found && (
        <Typography sx={{ color: "grey.100", fontWeight: 700, fontSize: "1.35rem", lineHeight: 1.2 }}>
          {storedRating}
          <Typography component="span" sx={{ color: "grey.500", fontSize: "0.8rem", fontWeight: 500, ml: 1 }}>
            {storedPlatform ? PLATFORM_LABEL[storedPlatform] : ""} {storedPerf ?? ""}
          </Typography>
        </Typography>
      )}

      {found && (
        <>
          <Typography sx={{ color: "grey.100", fontWeight: 700, fontSize: "1.35rem", lineHeight: 1.2 }}>
            {found.rawRating}
            <Typography component="span" sx={{ color: "grey.500", fontSize: "0.8rem", fontWeight: 500, ml: 1 }}>
              {PLATFORM_LABEL[found.platform] ?? found.platform} {found.perf}
            </Typography>
          </Typography>
          <Typography variant="caption" sx={{ color: "grey.500" }}>
            Your coach now calibrates to this.
          </Typography>
        </>
      )}

      {/* Every established rating we saw, across both linked accounts. */}
      {allSources.length > 0 && (
        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          {allSources.map((s) => (
            <Box key={`${s.platform}:${s.username}`}>
              <Typography variant="caption" sx={{ color: "grey.500" }}>
                {PLATFORM_LABEL[s.platform] ?? s.platform} · {s.username}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.6, mt: 0.4 }}>
                {s.perfs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: "grey.600" }}>
                    no established ratings yet
                  </Typography>
                ) : (
                  s.perfs.map((p) => (
                    <Chip
                      key={p.perf}
                      size="small"
                      label={`${p.perf} ${p.rating}`}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.06)",
                        color: "grey.200",
                        fontSize: "0.7rem",
                        height: 22,
                      }}
                    />
                  ))
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {/* Every non-success outcome is stated plainly. Nothing here quietly
          substitutes a number — that is the failure mode this product has been
          fighting all week. */}
      {result?.status === "no_username" && (
        <Typography variant="caption" sx={{ color: "grey.400" }}>
          {result.message}
        </Typography>
      )}
      {result?.status === "no_established_rating" && (
        <Typography variant="caption" sx={{ color: "warning.light", display: "block", mt: 1 }}>
          {result.message}
        </Typography>
      )}
      {result?.status === "unavailable" && (
        <Typography variant="caption" sx={{ color: "warning.light", display: "block", mt: 1 }}>
          {result.message} Your existing rating is unchanged.
        </Typography>
      )}
      {error && (
        <Typography variant="caption" sx={{ color: "error.light", display: "block", mt: 1 }}>
          {error}
        </Typography>
      )}

      <Button
        size="small"
        variant="outlined"
        disabled={busy || !hasUsername}
        onClick={() => void lookup(true)}
        sx={{ mt: 1.5, textTransform: "none", fontWeight: 600 }}
      >
        {storedRating != null || found ? "Refresh my rating" : "Find my rating"}
      </Button>
      {!hasUsername && (
        <Typography variant="caption" sx={{ color: "grey.500", display: "block", mt: 0.75 }}>
          Add a username above and save first.
        </Typography>
      )}
    </Box>
  );
}
