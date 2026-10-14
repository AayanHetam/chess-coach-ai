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
import { MastiAvatar } from "@/components/masti";
import { ACCENT, FONT_MONO, MOTION, RADIUS, TEXT, TYPE } from "@/theme/tokens";

export interface CourseTeachCardProps {
  probe: CourseProbe;
  /** What they actually played. */
  played: string;
  side: "white" | "black";
  theory: OpeningTheory | null;
  onContinue: () => void;
}

export function CourseTeachCard({
  probe,
  played,
  side,
  theory,
  onContinue,
}: CourseTeachCardProps) {
  const ev = probe.ev;
  const words = evalWords(ev?.cp ?? null, side);
  const replies = probe.next?.them ?? [];
  const source = sourceWords(probe.src, probe.loss);

  return (
    <Box data-testid="teach-card" sx={{ display: "grid", gap: 2.5 }}>
      <Typography
        role="status"
        aria-live="polite"
        sx={{ ...TYPE.h5, color: TEXT.primary }}
      >
        <MastiAvatar
          mood="idea"
          size={24}
          ring={false}
          style={{ verticalAlign: "middle", marginRight: 8 }}
        />
        Not the course move.
      </Typography>

      <Box sx={{ display: "grid", gap: 0.75 }}>
        <Row label="You played" value={played} mono testid="teach-played" />
        <Row
          label="The course plays"
          value={probe.san}
          mono
          accent
          testid="teach-answer"
        />
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
          {probe.games > 0 && (
            <Row label="Games here" value={probe.games.toLocaleString()} />
          )}
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
            <Row
              key={reply.san}
              label={reply.san}
              value={`${Math.round(reply.share * 100)}%`}
              mono
            />
          ))}
          {/* Never separately from the table: a reply list without its coverage
              implies a completeness we do not have. At rc 0.29, seven-tenths of
              what gets played here is not in the course. */}
          {probe.next?.rc !== undefined && (
            <Row
              label="Of what gets played here"
              value={`${Math.round(probe.next.rc * 100)}%`}
            />
          )}
        </Box>
      )}

      {theory && (
        <Box data-testid="teach-theory" sx={{ display: "grid", gap: 1 }}>
          <Label>
            {theory.name ? `The theory: ${theory.name}` : "The theory"}
          </Label>
          {/* Verbatim. Never paraphrased, summarised, or passed through a
              model — the excerpt is CC BY-SA and an adapted work would put the
              whole product under share-alike. */}
          {theory.excerpt.split(/\n{2,}/).map((para, i) => (
            <Typography key={i} sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
              {para}
            </Typography>
          ))}
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
            From{" "}
            <a
              href={theory.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit" }}
            >
              Wikibooks
            </a>
            , licensed{" "}
            <a
              href={theory.licenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit" }}
            >
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
          // The one primary action on the card.
          appearance: "none",
          cursor: "pointer",
          minHeight: 48,
          px: 3,
          borderRadius: `${RADIUS.pill}px`,
          border: "none",
          background: ACCENT.main,
          color: TEXT.onAccent,
          fontSize: TYPE.bodySmall.fontSize,
          fontWeight: 600,
          textAlign: "left",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          transition: `background-color ${MOTION.hover}, transform ${MOTION.press}`,
          "&:hover": { background: ACCENT.hover },
          "&:active": { transform: MOTION.pressScale },
          "&:focus-visible": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: 2,
          },
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
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 2,
      }}
    >
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
        {label}
      </Typography>
      <Typography
        data-testid={testid}
        sx={{
          // Case is never transformed here: "Nf3" is a move, "NF3" is not.
          ...TYPE.bodySmall,
          fontFamily: mono ? FONT_MONO : undefined,
          color: TEXT.primary,
          fontWeight: accent ? 600 : 400,
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
    <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
      {children}
    </Typography>
  );
}
