"use client";

// What we say when they got it wrong, and nothing when we have nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// BUILT AROUND THE REPLIES TABLE, NOT AROUND THE QUOTE
//
// Measured at the improving band across 3,991 decisions: 12.9% carry a
// Wikibooks excerpt, and the coverage collapses with depth — 86% at ply 2, 4%
// by ply 12. Meanwhile 78.6% carry `them` and `rc` on the node after our move.
//
// Build the card around the quote and it is empty seven times in eight. Build
// it around the replies table and it is dense four times in five. That is the
// answer to "quote only, stay silent" without the screen reading as unfinished.
//
// BLOCK ORDER FOLLOWS COVERAGE, so the card degrades from the bottom up and
// what disappears is always the last thing rather than a hole in the middle:
//
//   verdict           100%
//   the two moves     100%
//   engine facts      99.7%
//   replies table     78.6%
//   the quote         12.9%
//
// Every string here is authored by a human, quoted verbatim, or a number. No
// sentence is composed from a measured value plus a judgement — that shape
// ("the engine would rather you played X, by about Ncp") is what the two-column
// table exists to avoid.
// ─────────────────────────────────────────────────────────────────────────────

import { Box, Typography } from "@mui/material";
import type { CourseProbe } from "@/lib/courses/probes";
import { sourceWords } from "@/lib/courses/probes";
import { cpForSide, evalWords } from "@/lib/courses/lines";
import type { OpeningTheory } from "@/types/theory";

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, monospace";

export interface CourseTeachCardProps {
  probe: CourseProbe;
  /** What they actually played. */
  played: string;
  side: "white" | "black";
  theory: OpeningTheory | null;
  onContinue: () => void;
}

export function CourseTeachCard({ probe, played, side, theory, onContinue }: CourseTeachCardProps) {
  const ev = probe.ev;
  const words = evalWords(ev?.cp ?? null, side);
  const replies = probe.next?.them ?? [];
  const source = sourceWords(probe.src);

  return (
    <Box data-testid="teach-card" sx={{ display: "grid", gap: 2.5 }}>
      <Typography
        role="status"
        aria-live="polite"
        sx={{
          fontSize: "1rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        Not the course move.
      </Typography>

      <Box sx={{ display: "grid", gap: 0.75 }}>
        <Row label="You played" value={played} mono testid="teach-played" />
        <Row label="The course plays" value={probe.san} mono accent testid="teach-answer" />
      </Box>

      {ev && (
        <Box sx={{ display: "grid", gap: 0.5 }}>
          {/*
            From the PLAYER'S side, and labelled with it.

            `ev.cp` is white-relative, and `evalWords` below already converts to
            the player's side. Printing the raw number here put two opposite
            conventions on adjacent rows, and on a black course it printed the
            wrong sign outright: "+0.15" beside "slightly worse".
          */}
          <Row
            label={`Engine (${side})`}
            value={formatCp(cpForSide(ev.cp, side))}
            testid="teach-eval"
          />
          <Row label="Depth" value={String(ev.d)} />
          {words && <Row label="In words" value={words} />}
          {probe.games > 0 && <Row label="Games here" value={probe.games.toLocaleString()} />}
          {/* Shown only where our move deviates from the ordinary case: 97.6%
              of decisions are corpus-confirmed and a row printed on all of them
              is wallpaper, which is the rule lineNotes already writes down. */}
          {source && <Row label="Source" value={source} />}
        </Box>
      )}

      {replies.length > 0 && (
        <Box data-testid="teach-replies" sx={{ display: "grid", gap: 0.5 }}>
          <Label>Their replies here</Label>
          {replies.slice(0, 5).map((reply) => (
            <Row key={reply.san} label={reply.san} value={`${Math.round(reply.share * 100)}%`} mono />
          ))}
          {/* Never separately from the table: a reply list without its coverage
              implies a completeness we do not have. At rc 0.29, seven-tenths of
              what gets played here is not in the course. */}
          {probe.next?.rc !== undefined && (
            <Row label="Of what gets played here" value={`${Math.round(probe.next.rc * 100)}%`} />
          )}
        </Box>
      )}

      {theory && (
        <Box data-testid="teach-theory" sx={{ display: "grid", gap: 1 }}>
          <Label>{theory.name ? `The theory — ${theory.name}` : "The theory"}</Label>
          {/* Verbatim. Never paraphrased, summarised, or passed through a
              model — the excerpt is CC BY-SA and an adapted work would put the
              whole product under share-alike. */}
          {theory.excerpt.split(/\n{2,}/).map((para, i) => (
            <Typography
              key={i}
              sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.86rem", lineHeight: 1.7 }}
            >
              {para}
            </Typography>
          ))}
          <Typography sx={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)" }}>
            From{" "}
            <a href={theory.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              Wikibooks
            </a>
            , licensed{" "}
            <a href={theory.licenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              {theory.licence}
            </a>
            .
          </Typography>
        </Box>
      )}

      <Box
        component="button"
        type="button"
        onClick={onContinue}
        data-testid="teach-continue"
        sx={{
          appearance: "none",
          cursor: "pointer",
          minHeight: 48,
          px: 2.5,
          borderRadius: "1.2rem",
          border: `1px solid ${EMBER}6b`,
          background: `${EMBER}1a`,
          color: EMBER,
          fontSize: "0.92rem",
          textAlign: "left",
          transition: "background 200ms ease-out",
          "&:hover": { background: `${EMBER}2b` },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        Ask me again this round →
      </Box>
    </Box>
  );
}

/**
 * A centipawn score, as a number and never as a sentence.
 *
 * White-relative, which is why the label names the colour: the same position
 * carries a different sign for the two sides and a bare "+0.22" is a claim
 * about somebody.
 */
function formatCp(cp: number): string {
  if (Math.abs(cp) >= 99000) return cp > 0 ? "mate" : "mated";
  const pawns = cp / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function Row({
  label,
  value,
  mono,
  accent,
  testid,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  testid?: string;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 2 }}>
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem" }}>{label}</Typography>
      <Typography
        data-testid={testid}
        sx={{
          // Never uppercased: MUI's default textTransform turns "Nf3" into
          // "NF3", which is not a move anyone writes.
          textTransform: "none",
          fontFamily: mono ? MONO : undefined,
          color: accent ? EMBER : "rgba(255,255,255,0.88)",
          fontSize: mono ? "0.95rem" : "0.85rem",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        color: "rgba(255,255,255,0.4)",
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Typography>
  );
}
