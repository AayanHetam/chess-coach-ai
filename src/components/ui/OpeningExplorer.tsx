"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, BookOpen, TrendingUp } from "lucide-react";

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
  /** If provided, renders a "Takeover" button in the header. */
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
        // Same-origin proxy — see src/app/api/opening-explorer/route.ts.
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
        borderRadius: "1.25rem",
        background: "rgba(20,22,28,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <BookOpen size={14} color="#F97316" />
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.55)",
            textTransform: "uppercase",
          }}
        >
          Master games
        </Typography>
        {displayName && (
          <Typography
            sx={{
              fontSize: "0.78rem",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 500,
            }}
          >
            · {displayName}
            {displayEco && (
              <Box
                component="span"
                sx={{
                  ml: 1,
                  fontSize: "0.7rem",
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "Monaco, Menlo, monospace",
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
              fontSize: "0.72rem",
              color: "rgba(255,255,255,0.45)",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            {total.toLocaleString()} games
          </Typography>
        )}
        {onTakeover && (
          <Button
            onClick={onTakeover}
            startIcon={<ArrowLeftRight size={13} />}
            size="small"
            sx={{
              bgcolor: "rgba(34,197,94,0.14)",
              color: "#86efac",
              fontWeight: 700,
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              px: 1.5,
              py: 0.4,
              borderRadius: "999px",
              border: "1px solid rgba(34,197,94,0.32)",
              minWidth: 0,
              transition: "all 180ms ease",
              "&:hover": {
                bgcolor: "rgba(34,197,94,0.22)",
                borderColor: "rgba(34,197,94,0.5)",
                color: "#bbf7d0",
                transform: "translateY(-1px)",
              },
            }}
          >
            Takeover
          </Button>
        )}
      </Stack>

      {loading && !hasMoves && (
        <Typography sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", py: 1.5 }}>
          Querying Lichess masters database…
        </Typography>
      )}

      {!loading && !hasMoves && !error && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1.5 }}>
          <TrendingUp size={14} color="rgba(255,255,255,0.3)" />
          <Typography sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>
            No master games reached this exact position. You're in original territory.
          </Typography>
        </Stack>
      )}

      {error && (
        <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ py: 1 }}>
          <Box
            sx={{
              mt: 0.4,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              flexShrink: 0,
            }}
          />
          <Box>
            <Typography
              sx={{
                fontSize: "0.82rem",
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1.5,
              }}
            >
              Master-game stats unavailable on this network.
            </Typography>
            <Typography
              sx={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.35)",
                mt: 0.5,
                lineHeight: 1.5,
              }}
            >
              Live in production · ranks top moves by win rate from 2M+
              over-the-board master games.
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
                  gridTemplateColumns: "minmax(48px, 64px) 1fr minmax(56px, 80px)",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: "8px",
                  cursor: onMoveClick ? "pointer" : "default",
                  transition: "background 180ms ease",
                  "&:hover": onMoveClick
                    ? {
                        background: "rgba(249,115,22,0.06)",
                      }
                    : undefined,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.92rem",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.92)",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {m.san}
                </Typography>
                <Box
                  sx={{
                    height: 8,
                    borderRadius: "4px",
                    overflow: "hidden",
                    display: "flex",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Box
                    sx={{
                      width: `${whitePct}%`,
                      background: "linear-gradient(90deg, #FB923C, #F97316)",
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
                    fontSize: "0.78rem",
                    color: "rgba(255,255,255,0.5)",
                    fontFamily: "Monaco, Menlo, monospace",
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
