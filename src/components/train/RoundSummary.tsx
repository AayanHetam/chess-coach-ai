// The end of a round, said out loud.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS SCREEN HAD TO EXIST
//
// A finished round used to `router.replace` straight into the next one. The
// work happened and nothing acknowledged it, which costs the mode the one thing
// it can claim and nothing else in this market can: the session gets SHORTER as
// you learn. That is only true if a player can see it — the open count falling
// from 38 to 31 to 27 is the product's whole argument, and it was being thrown
// away every five questions.
//
// THE NUMBER THAT LEADS IS `open`, AND IT ONLY FALLS. Right-and-wrong for the
// round is underneath it: a round can go badly and the chapter still shrink,
// and leading with the round's score would make a bad round read as a loss.
//
// It also has to be able to say NOTHING WAS ASKED without that looking broken.
// A player who already knows a chapter is handed an empty round by design, and
// "you already knew all 12 decisions" is the correct end of that sitting.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Box, Typography } from "@mui/material";
import { ArrowRight, Check } from "lucide-react";
import type { Tally } from "@/lib/learn/chapterRound";
import { Masti, scoreMood, type MastiMood } from "@/components/masti";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/** A pill link's body. The <a> around it takes focus, so the ring reads from it. */
const PILL_SX = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 48,
  px: 3,
  borderRadius: `${RADIUS.pill}px`,
  fontSize: TYPE.bodySmall.fontSize,
  fontWeight: 600,
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
  "&:active": { transform: MOTION.pressScale },
  "a:focus-visible > &": {
    outline: `2px solid ${TEXT.primary}`,
    outlineOffset: 2,
  },
} as const;

export interface RoundSummaryProps {
  round: number;
  rounds: number;
  /** Correct answers this round. */
  right: number;
  /** Wrong answers this round. Not `size - right` — a miss can be re-asked. */
  wrong: number;
  /** The chapter as it stands now. */
  tally: Tally;
  /** `tally.open` when the round opened, so the fall is a measured difference. */
  openBefore: number | null;
  /** Nothing was asked: they already knew everything the round could offer. */
  empty: boolean;
  /** A drill says different things: it is not measuring what you owe. */
  drill: boolean;
  /** When the next card in this chapter comes back, epoch ms, or null. */
  dueAt: number | null;
  /** Where "next round" goes. Null when this was the last one. */
  nextHref: string | null;
  /** Back to the course, or to the drill picker. */
  exitHref: string;
  exitLabel: string;
  now: number;
}

export function RoundSummary({
  round,
  rounds,
  right,
  wrong,
  tally,
  openBefore,
  empty,
  drill,
  dueAt,
  nextHref,
  exitHref,
  exitLabel,
  now,
}: RoundSummaryProps) {
  const closed = tally.total > 0 && tally.known === tally.total;
  const fell = openBefore !== null ? openBefore - tally.open : 0;
  // Masti follows the headline, not the round score: the number that leads is
  // how much the chapter shrank, so a round that shrank it is a good round.
  const mood: MastiMood = empty
    ? "idea"
    : closed
      ? "excited"
      : drill
        ? scoreMood(right, right + wrong)
        : fell >= 3
          ? "excited"
          : fell > 0
            ? "idea"
            : "nervous";

  return (
    <Box
      data-testid="round-summary"
      sx={{ width: "100%", maxWidth: 560, display: "grid", gap: 3 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
            {nextHref ? `Round ${round} of ${rounds}` : "Sitting done"}
          </Typography>
          <Typography
            component="h1"
            data-testid="summary-headline"
            sx={{
              ...TYPE.h2,
              fontSize: { xs: "1.375rem", md: TYPE.h2.fontSize },
              mt: 0.75,
              color: TEXT.primary,
            }}
          >
            {empty
              ? closed
                ? `You already knew all ${tally.total} decisions here.`
                : "Nothing left to ask in this round."
              : closed
                ? "That is the whole chapter."
                : drill
                  ? `${right} of ${right + wrong} first time.`
                  : fell > 0
                    ? `${fell} fewer to learn.`
                    : "Nothing new stuck that time."}
          </Typography>
        </Box>
        <Masti
          mood={mood}
          size={88}
          loops={2}
          decorative
          data-testid="round-summary-masti"
        />
      </Box>

      {/* The chapter, not the round. This is the number that only falls. */}
      {!drill && tally.total > 0 && (
        <Box data-testid="summary-open">
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 2,
              mb: 1,
            }}
          >
            <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
              Left to learn in this chapter
            </Typography>
            <Typography
              sx={{
                ...TYPE.h3,
                color: closed ? STATUS.success : TEXT.primary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tally.open}
            </Typography>
          </Box>
          <Box
            sx={{
              height: 6,
              borderRadius: 3,
              background: LINE.hairline,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${Math.round((tally.known / Math.max(1, tally.total)) * 100)}%`,
                background: ACCENT.main,
              }}
            />
          </Box>
        </Box>
      )}

      {!empty && (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Cell label="Right" value={right} testid="summary-right" />
          <Cell label="Missed" value={wrong} testid="summary-wrong" />
        </Box>
      )}

      {/*
        The review date, which exists only because something went wrong. A
        chapter answered perfectly says nothing here, and that silence is the
        claim: cards are earned, never granted.
      */}
      {dueAt !== null && (
        <Typography
          data-testid="summary-due"
          sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}
        >
          {dueAt <= now
            ? "Something here is due back now."
            : `Next review ${whenWords(dueAt, now)}.`}
        </Typography>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {nextHref && !closed && (
          <Link
            href={nextHref}
            style={{ textDecoration: "none" }}
            data-testid="summary-next"
          >
            <Box
              sx={{
                ...PILL_SX,
                gap: 1.25,
                background: ACCENT.main,
                color: TEXT.onAccent,
                "&:hover": { background: ACCENT.hover },
              }}
            >
              Next round
              <ArrowRight size={17} aria-hidden />
            </Box>
          </Link>
        )}
        <Link
          href={exitHref}
          style={{ textDecoration: "none" }}
          data-testid="summary-exit"
        >
          <Box
            sx={{
              ...PILL_SX,
              gap: 1,
              border: `1px solid ${LINE.strong}`,
              background: "transparent",
              color: TEXT.primary,
              "&:hover": {
                background: "rgba(255,255,255,0.06)",
                borderColor: TEXT.secondary,
              },
            }}
          >
            {closed && <Check size={16} color={STATUS.success} aria-hidden />}
            {exitLabel}
          </Box>
        </Link>
      </Box>
    </Box>
  );
}

/**
 * "in 6 days". Days only — an interval measured in days should not be reported
 * to the hour, and "in 5 hours" on a card that is a day out is a false
 * precision the schedule does not have.
 */
export function whenWords(dueAt: number, now: number): string {
  const days = Math.round((dueAt - now) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function Cell({
  label,
  value,
  testid,
}: {
  label: string;
  value: number;
  testid: string;
}) {
  return (
    <Box
      sx={{
        borderRadius: `${RADIUS.card}px`,
        border: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
        px: 2,
        py: 1.5,
      }}
    >
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
        {label}
      </Typography>
      <Typography
        data-testid={testid}
        sx={{
          ...TYPE.h3,
          color: TEXT.primary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
