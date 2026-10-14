"use client";

import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, BookOpen, TrendingUp } from "lucide-react";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface OpeningMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

interface OpeningExplorerData {
  white: number;
  draws: number;
  black: number;
  moves: OpeningMove[];
  opening?: { eco: string; name: string };
}

interface OpeningExplorerProps {
  fen: string;
  /** Shown when the API hasn't (or can't) returned an opening name. */
  fallbackOpeningName?: string;
  fallbackEco?: string;
  onMoveClick?: (uci: string) => void;
  /** If provided, renders a "Play from here" button in the header. */
  onTakeover?: () => void;
}

export function OpeningExplorer({
  fen,
  fallbackOpeningName,
  fallbackEco,
  onMoveClick,
  onTakeover,
}: OpeningExplorerProps) {
  const [data, setData] = useState<OpeningExplorerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!fen) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const handle = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        // Same-origin proxy, see src/app/api/opening-explorer/route.ts.
        // Bypasses client-side network filters that block explorer.lichess.ovh.
        const url = `/api/opening-explorer?fen=${encodeURIComponent(fen)}&moves=6`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as OpeningExplorerData;
        if (!ctrl.signal.aborted) setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [fen]);

  const total = data ? data.white + data.draws + data.black : 0;
  const hasMoves = data && data.moves.length > 0;
  const displayName = data?.opening?.name ?? fallbackOpeningName;
  const displayEco = data?.opening?.eco ?? fallbackEco;

  return (
    <Box
      sx={{
        mt: 2,
        p: 2.25,
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <BookOpen
          size={18}
          strokeWidth={1.75}
          color={TEXT.secondary}
          aria-hidden
        />
        <Typography
          sx={{
            fontSize: TYPE.bodySmall.fontSize,
            fontWeight: 600,
            color: TEXT.primary,
          }}
        >
          Master games
        </Typography>
        {displayName && (
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              color: TEXT.secondary,
              fontWeight: 500,
            }}
          >
            · {displayName}
            {displayEco && (
              <Box
                component="span"
                sx={{
                  ml: 1,
                  fontSize: TYPE.caption.fontSize,
                  color: TEXT.secondary,
                  fontFamily: FONT_MONO,
                }}
              >
                {displayEco}
              </Box>
            )}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {total > 0 && (
          <Typography
            sx={{
              fontSize: TYPE.caption.fontSize,
              color: TEXT.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {total.toLocaleString()} games
          </Typography>
        )}
        {onTakeover && (
          <Button
            onClick={onTakeover}
            startIcon={<ArrowLeftRight size={14} strokeWidth={1.75} />}
            size="small"
            variant="outlined"
          >
            Play from here
          </Button>
        )}
      </Stack>

      {loading && !hasMoves && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          role="status"
          sx={{ py: 1.5 }}
        >
          <CircularProgress size={16} sx={{ color: TEXT.secondary }} />
          <Typography
            sx={{ fontSize: TYPE.bodySmall.fontSize, color: TEXT.secondary }}
          >
            Loading master games
          </Typography>
        </Stack>
      )}

      {!loading && !hasMoves && !error && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1.5 }}>
          <TrendingUp
            size={18}
            strokeWidth={1.75}
            color={TEXT.secondary}
            aria-hidden
          />
          <Typography
            sx={{ fontSize: TYPE.bodySmall.fontSize, color: TEXT.secondary }}
          >
            No master games reached this exact position. You're in original
            territory.
          </Typography>
        </Stack>
      )}

      {error && (
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="flex-start"
          sx={{ py: 1 }}
        >
          <Box
            aria-hidden
            sx={{
              mt: 0.6,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS.warning,
              flexShrink: 0,
            }}
          />
          <Box>
            <Typography
              sx={{
                fontSize: TYPE.bodySmall.fontSize,
                color: TEXT.primary,
                lineHeight: 1.5,
              }}
            >
              The master games database didn't answer on this network.
            </Typography>
            <Typography
              sx={{
                fontSize: TYPE.caption.fontSize,
                color: TEXT.secondary,
                mt: 0.5,
                lineHeight: 1.5,
              }}
            >
              Try again on another connection.
            </Typography>
          </Box>
        </Stack>
      )}

      {hasMoves && (
        <Stack spacing={0.75}>
          {data!.moves.slice(0, 5).map((m) => {
            const moveTotal = m.white + m.draws + m.black;
            const whitePct = (m.white / moveTotal) * 100;
            const drawPct = (m.draws / moveTotal) * 100;
            const blackPct = (m.black / moveTotal) * 100;
            return (
              <Box
                key={m.uci}
                onClick={() => onMoveClick?.(m.uci)}
                sx={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(48px, 64px) 1fr minmax(56px, 80px)",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: `${RADIUS.small}px`,
                  cursor: onMoveClick ? "pointer" : "default",
                  transition: `background-color ${MOTION.hover}`,
                  "&:hover": onMoveClick
                    ? {
                        background: "rgba(255,255,255,0.06)",
                      }
                    : undefined,
                  "&:active": onMoveClick
                    ? { background: SURFACE.raisedTertiary }
                    : undefined,
                }}
              >
                <Typography
                  sx={{
                    fontSize: TYPE.bodySmall.fontSize,
                    fontWeight: 600,
                    color: TEXT.primary,
                    fontFamily: FONT_MONO,
                  }}
                >
                  {m.san}
                </Typography>
                <Box
                  sx={{
                    height: 8,
                    borderRadius: `${RADIUS.small}px`,
                    overflow: "hidden",
                    display: "flex",
                    background: SURFACE.raisedSecondary,
                  }}
                >
                  <Box
                    sx={{
                      width: `${whitePct}%`,
                      background: ACCENT.main,
                    }}
                  />
                  <Box
                    sx={{
                      width: `${drawPct}%`,
                      background: "rgba(255,255,255,0.22)",
                    }}
                  />
                  <Box
                    sx={{
                      width: `${blackPct}%`,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontSize: TYPE.caption.fontSize,
                    color: TEXT.secondary,
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                  }}
                >
                  {moveTotal.toLocaleString()}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
