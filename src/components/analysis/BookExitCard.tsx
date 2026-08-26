"use client";

// Where this game left what players at YOUR level actually play.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY SENTENCE HERE IS A COUNT, NEVER A VERDICT.
//
// No engine has been consulted and no evaluation is attached. Frequency is not
// quality: a move one player in a hundred plays can be the best move on the
// board, and the panel says so out loud rather than leaving the reader to infer
// that "off book" means "wrong". That is the whole difference between this and
// an accuracy score.
//
// The five outcomes render as five different things, and the two that are NOT
// about the reader — their opponent going first, and the corpus running out —
// are worded so they cannot be mistaken for the one that is. "We have no data
// here" read as "you left theory" would tell a player they went off book for
// reaching a position nobody in the sample happened to reach.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { BookOpen } from "lucide-react";
import type { BookExitResponse } from "@/pages/api/book-exit";
import { renderBookExit } from "@/lib/book/copy";

const EMBER = "#FB923C";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

const pct = (perMille: number) => `${Math.round(perMille / 10)}%`;

export interface BookExitCardProps {
  /** The game's SAN moves, in order. */
  sans: string[];
  /** The colour the reader played. */
  side: "white" | "black";
}

export default function BookExitCard({ sans, side }: BookExitCardProps) {
  const [state, setState] = useState<BookExitResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (sans.length === 0) return;
    let live = true;
    void fetch("/api/book-exit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sans, side }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<BookExitResponse>) : null))
      .then((body) => {
        if (!live) return;
        // A signed-out reader gets a 401 and this panel simply is not there.
        // Nothing on the page depends on it.
        if (body) setState(body);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // The game and the side are the whole request. Re-running on anything else
    // would re-ask the same question.
  }, [sans, side]);

  if (failed || !state) return null;
  const body = renderBookExit(state);
  if (!body) return null;

  return (
    <Box
      role="status"
      data-testid="book-exit"
      sx={{
        borderRadius: "1.5rem",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(12px)",
        px: 2,
        py: 1.75,
        transition: "border-color 200ms ease",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
        <BookOpen size={13} color={EMBER} aria-hidden />
        <Typography
          sx={{
            fontSize: "0.68rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          {body.label}
        </Typography>
      </Box>
      <Typography sx={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45 }}>
        {body.headline}
      </Typography>
      {body.detail && (
        <Typography
          sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", lineHeight: 1.6, mt: 0.75 }}
        >
          {body.detail}
        </Typography>
      )}
      {body.moves.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
          {body.moves.map((m) => (
            <Box
              key={m.san}
              sx={{
                display: "flex",
                alignItems: "baseline",
                gap: 0.5,
                px: 1,
                py: 0.4,
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.85)" }}>
                {m.san}
              </Typography>
              <Typography
                sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}
              >
                {pct(m.perMille)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {body.disclaimer && (
        <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", lineHeight: 1.6, mt: 1.25 }}>
          {body.disclaimer}
        </Typography>
      )}
    </Box>
  );
}
