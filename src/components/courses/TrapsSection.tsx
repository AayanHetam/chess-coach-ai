"use client";

// How players at your level actually lose this opening.
//
// ─────────────────────────────────────────────────────────────────────────────
// NO ENGINE TOUCHED ANY NUMBER HERE.
//
// Every figure is a count of real games from the reader's own rating band. A
// trap is "played often at your level, and loses" — not "objectively bad". The
// two are different claims and only the first is about the people this reader
// sits down against. It is also the more useful one: a move Stockfish dislikes
// at -0.4 is irrelevant if nobody under 1200 knows how to punish it, and a move
// it calls equal is a disaster if half the band falls into it.
//
// YOURS AND THEIRS ARE NEVER MERGED. The same move is a warning when the reader
// plays it and an opportunity when their opponent does, and one list would tell
// a Caro-Kann player that a Caro-Kann blunder is theirs.
// ─────────────────────────────────────────────────────────────────────────────

import { Box, Typography } from "@mui/material";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { MastiAvatar } from "@/components/masti";
import type { CourseTraps } from "@/lib/book/traps";
import type { Trap } from "@/types/traps";
import { FONT_MONO, LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** SAN moves as a reader writes them: `1.e4 e5 2.Nf3`. */
const notate = (sans: string[]): string =>
  sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(" ");

export interface TrapsSectionProps {
  /** Null when the band has no file — a different thing from finding nothing. */
  traps: CourseTraps | null;
  band: string;
  /** The colour this course is played from. */
  side: "white" | "black";
}

export default function TrapsSection({ traps, side }: TrapsSectionProps) {
  // BOTH the "no file" case and the "found nothing" case render nothing at all,
  // and the reason is the same for both: an empty section under this heading is
  // a claim. A reader takes "How this goes wrong at your level" followed by
  // white space as "there is nothing to fall for here", which is a statement
  // about the opening that neither case is entitled to make. Silence says
  // nothing, which is exactly right when we have nothing.
  //
  // `trapsForCourse` still keeps the two apart, because they are different
  // facts and a future surface may want to say "we searched 4,756 decisions in
  // this line and found none" — a sentence only the second case can say. This
  // component simply does not need the difference yet, and pretending it uses
  // it would be the same code-says-one-thing-comment-says-another bug that hid
  // half a course's depth for a year.
  if (!traps) return null;
  if (traps.yours.length === 0 && traps.theirs.length === 0) return null;

  return (
    <Box sx={{ mt: 5 }} data-testid="course-traps">
      <Typography
        component="h2"
        sx={{ ...TYPE.h3, color: TEXT.primary, mb: 0.5 }}
      >
        How this goes wrong at your level
      </Typography>
      <Typography
        sx={{ ...TYPE.bodySmall, color: TEXT.secondary, maxWidth: "65ch" }}
      >
        Counted from {traps.games?.toLocaleString() ?? "the"} games by players
        in your band. These are moves that get played often and then lose. No
        engine was asked for an opinion.
      </Typography>

      {/* Masti reads the two lists the way the reader should: worried by the
          moves that cost you, lit up by the ones that cost them. Stills, as
          every avatar is. */}
      {traps.yours.length > 0 && (
        <Group
          icon={<MastiAvatar mood="nervous" size={22} ring={false} />}
          title="What you are most likely to fall for"
          traps={traps.yours}
          total={traps.totalYours}
          side={side}
          possessive="you"
        />
      )}
      {traps.theirs.length > 0 && (
        <Group
          icon={<MastiAvatar mood="idea" size={22} ring={false} />}
          title="What your opponents fall for"
          traps={traps.theirs}
          total={traps.totalTheirs}
          side={side === "white" ? "black" : "white"}
          possessive="they"
        />
      )}

      {/* The noise floor, next to the finding. A list of traps with no idea how
          many decisions were searched invites the reader to assume the search
          was exhaustive and the threshold was free. */}
      <Typography
        sx={{ ...TYPE.caption, mt: 2, color: TEXT.secondary, maxWidth: "65ch" }}
      >
        Found by testing {traps.tests.toLocaleString()} decisions in your
        band&rsquo;s games and keeping only those where the drop in score is
        more than four standard errors below the alternatives. About{" "}
        {traps.expectedFalsePositives} of these would be expected by chance
        alone.
      </Typography>
    </Box>
  );
}

function Group({
  icon,
  title,
  traps,
  total,
  side,
  possessive,
}: {
  icon: React.ReactNode;
  title: string;
  traps: Trap[];
  /** How many exist, not how many are shown. */
  total: number;
  side: "white" | "black";
  possessive: "you" | "they";
}) {
  return (
    <Box sx={{ mt: 2.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          mb: 1.25,
          flexWrap: "wrap",
        }}
      >
        {icon}
        <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
          {title}
        </Typography>
        {/* THE CAP IS SAID OUT LOUD. `1.e4` carries 514 of these at the `new`
            band; showing five of them as though they were all five would be a
            truncated list presented as a complete one, which is a claim about
            the opening rather than about the page. */}
        {total > traps.length && (
          <Typography
            data-testid="traps-capped"
            sx={{ ...TYPE.caption, color: TEXT.secondary }}
          >
            (the {traps.length} costliest of {total.toLocaleString()})
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {traps.map((trap) => (
          <TrapRow
            key={`${trap.fen}|${trap.san}`}
            trap={trap}
            side={side}
            possessive={possessive}
          />
        ))}
      </Box>
    </Box>
  );
}

function TrapRow({
  trap,
  side,
  possessive,
}: {
  trap: Trap;
  side: "white" | "black";
  possessive: "you" | "they";
}) {
  const verb = possessive === "you" ? "You score" : "They score";
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        alignItems: "flex-start",
        borderRadius: `${RADIUS.card}px`,
        border: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
        p: { xs: 1.5, md: 2 },
      }}
    >
      <Box sx={{ flexShrink: 0, display: { xs: "none", sm: "block" } }}>
        <OpeningDiagram moves={trap.line} side={side} px={88} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            ...TYPE.caption,
            fontFamily: FONT_MONO,
            color: TEXT.secondary,
            mb: 0.5,
          }}
        >
          {notate(trap.line)}
        </Typography>
        <Typography sx={{ ...TYPE.h5, color: TEXT.primary }}>
          {trap.san}: played {pct(trap.share)} of the time here.
        </Typography>
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary, mt: 0.5 }}>
          {verb} {pct(trap.score)} after it, against {pct(trap.baseline)} for
          everything else played from this position, over{" "}
          {trap.games.toLocaleString()} games.
        </Typography>
        {trap.instead.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: 0.75,
              mt: 1,
            }}
          >
            <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
              {possessive === "you" ? "Instead:" : "They should play:"}
            </Typography>
            {trap.instead.map((alt) => (
              <Box
                key={alt.san}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 0.5,
                  px: 1,
                  py: 0.35,
                  borderRadius: `${RADIUS.small}px`,
                  background: SURFACE.raisedSecondary,
                }}
              >
                <Typography
                  sx={{
                    ...TYPE.caption,
                    fontFamily: FONT_MONO,
                    color: TEXT.primary,
                  }}
                >
                  {alt.san}
                </Typography>
                <Typography
                  sx={{
                    ...TYPE.caption,
                    color: TEXT.secondary,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pct(alt.score)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
