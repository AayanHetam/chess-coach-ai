"use client";

// The teaching panel. One column, one act at a time.
//
// It is deliberately EMPTY in the first act except for the instruction. A panel
// that shows the answer before the question is a panel that gets read instead
// of the board, and the whole point of the first act is that the player moves
// before they are told anything.

import { Box, Button, Typography } from "@mui/material";
import { ArrowRight, BookOpen, Check, Crown, Target } from "lucide-react";
import { Masti, MastiAvatar } from "@/components/masti";
import type { RepertoireHole } from "@/lib/learn/repertoireHole";
import type { TrainerLine, TrainerState } from "@/lib/learn/trainerSession";
import type { MasterView } from "@/lib/master/ideas";
import type { OpeningTheory } from "@/types/theory";

import {
  ACCENT,
  FONT_MONO,
  LINE,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

const pct = (v: number) => Math.round(v * 100);

export interface TrainerPanelProps {
  state: TrainerState;
  line: TrainerLine;
  /**
   * The measurement this line came from, when there is one.
   *
   * Null on a scheduled review: the card carries the line, and the finding
   * that produced it is deliberately not required — a repaired line stops
   * being flagged, which is the point. See reviewSchedule.ts.
   */
  hole: RepertoireHole | null;
  theory: OpeningTheory | null;
  master: MasterView | null;
  onAdvance: () => void;
  onExit: () => void;
  /**
   * Where they left off, when this session was resumed.
   *
   * Shown once, in words. Landing mid-drill with an unexplained streak reads
   * as a bug; one sentence turns it into a courtesy.
   */
  resumedNote?: string | null;
  /** When this line next comes back, in words. Review sessions only. */
  nextReview?: string | null;
  /**
   * Whether this device managed to keep the schedule that was just written.
   *
   * False is rare — storage full or disabled — and it has to be said out loud.
   * The old code caught that failure and carried on, so a player finished three
   * clean runs, read "we will check you still have it in 6 days", and was never
   * asked again. Being told costs a sentence; not being told costs the line.
   */
  savedLocally?: boolean;
}

export default function TrainerPanel(props: TrainerPanelProps) {
  const { state } = props;
  return (
    <Box
      component="section"
      aria-label="Coaching"
      sx={{
        width: { xs: "100%", lg: 380 },
        flexShrink: 0,
        borderRadius: `${RADIUS.card}px`,
        border: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
        display: "flex",
        flexDirection: "column",
        maxHeight: { lg: "calc(100dvh - 48px)" },
        overflow: "hidden",
      }}
    >
      {/* The content scrolls; the action does not. A primary CTA that sits
          below the fold of a panel with no scroll cue is a CTA nobody presses,
          and this panel is long by design on the LEARN act. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          p: { xs: 2.5, md: 3 },
        }}
      >
        {props.resumedNote && state.act !== "done" && (
          <Box
            role="status"
            sx={{
              px: 1.25,
              py: 0.85,
              borderRadius: `${RADIUS.control}px`,
              border: `1px solid ${LINE.hairline}`,
              background: SURFACE.raisedSecondary,
            }}
          >
            <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
              Picked up where you left off. {props.resumedNote}.
            </Typography>
          </Box>
        )}
        {state.act === "confront" && <Confront {...props} />}
        {state.act === "learn" && <Learn {...props} />}
        {state.act === "drill" && <Drill {...props} />}
        {state.act === "done" && <Done {...props} />}
        {state.act === "done" && props.savedLocally === false && (
          <Box
            role="status"
            data-testid="schedule-save-state"
            sx={{
              px: 1.25,
              py: 0.85,
              borderRadius: `${RADIUS.control}px`,
              border: `1px solid ${LINE.hairline}`,
              background: STATUS.errorTint,
            }}
          >
            <Typography sx={{ ...TYPE.caption, color: TEXT.primary }}>
              This device is out of storage, so we could not save the reminder.
              Sign in and it will be kept on your account instead.
            </Typography>
          </Box>
        )}
      </Box>
      <PanelAction {...props} />
    </Box>
  );
}

/**
 * The one action for the current act, pinned to the panel floor, on the
 * panel's own surface with a hairline above it.
 */
function PanelAction({ state, line, onAdvance, onExit }: TrainerPanelProps) {
  if (state.act === "confront" || state.act === "drill") return null;
  const isLearn = state.act === "learn";
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: { xs: 2.5, md: 3 },
        pb: { xs: 2.5, md: 3 },
        pt: 1.5,
        borderTop: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
      }}
    >
      <Primary onClick={isLearn ? onAdvance : onExit}>
        {isLearn
          ? line.target
            ? `Drill ${line.target.san}`
            : "Finish"
          : "Back to your plan"}
        <ArrowRight size={16} aria-hidden />
      </Primary>
    </Box>
  );
}

/** One block of the act. Visible from the first frame; nothing rises in. */
function Block({ children }: { children: React.ReactNode }) {
  return <Box>{children}</Box>;
}

// ── Act 1 ────────────────────────────────────────────────────────────────────

function Confront({ hole }: TrainerPanelProps) {
  if (!hole) return null;
  return (
    <Block>
      <Label icon={<Target size={15} />}>Your move</Label>
      <Typography sx={{ ...TYPE.h5, color: TEXT.primary, mb: 1 }}>
        Play the move you normally play here.
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        You have reached this position {hole.games} times. Play it the way you
        would in a real game, and we will look at what happened next.
      </Typography>
    </Block>
  );
}

// ── Act 2 ────────────────────────────────────────────────────────────────────

function Learn({ state, hole, theory, master, line }: TrainerPanelProps) {
  if (!hole) return null;
  const played = state.confrontMove ?? "";
  return (
    <>
      <Block>
        <Label icon={<Target size={15} />}>Your record here</Label>
        {state.playedHabit ? (
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary, mb: 1.5 }}>
            You played <Mono>{played}</Mono>, which is what you play here.
          </Typography>
        ) : (
          // They did not reproduce the habit. Saying "you always play X" now
          // would be a claim contradicted by the move on the board.
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary, mb: 1.5 }}>
            You played <Mono>{played}</Mono>. Your games say you usually play{" "}
            <Mono>{line.moves[line.moves.length - 1]}</Mono> here.
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", mb: 0.5 }}>
          <Stat label="You score" value={`${pct(hole.score)}%`} tone="bad" />
          <Stat label="Your average" value={`${pct(hole.baseline)}%`} />
          <Stat label="Games" value={String(hole.games)} />
        </Box>
        <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 1 }}>
          {hole.tier === "confirmed"
            ? "Confirmed: this survived a correction across every line we tested."
            : "Signal: the evidence is real but short of proof at this sample."}
        </Typography>
      </Block>

      <Block>
        <Label icon={<Crown size={15} />}>The verdict</Label>
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
          {hole.diagnosis === "move" ? (
            <>
              The engine would rather you played <Mono>{hole.betterMove}</Mono>,
              by about <Mono>{Math.round(hole.cpLoss ?? 0)}cp</Mono>.
            </>
          ) : (
            <>
              Your move is sound and the engine has no complaint. It is the
              position that does not suit you, not the move.
            </>
          )}
        </Typography>
      </Block>

      {theory && (
        <Block>
          <Label icon={<BookOpen size={15} />}>
            {theory.name ? `The theory: ${theory.name}` : "The theory"}
          </Label>
          {theory.excerpt.split(/\n{2,}/).map((para, i) => (
            <Typography
              key={i}
              sx={{
                ...TYPE.bodySmall,
                color: TEXT.primary,
                mt: i === 0 ? 0 : 1,
              }}
            >
              {para}
            </Typography>
          ))}
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 1.25 }}>
            From <Link href={theory.sourceUrl}>Wikibooks</Link>, licensed{" "}
            <Link href={theory.licenceUrl}>{theory.licence}</Link>.
          </Typography>
        </Block>
      )}

      {master && master.yourMove && (
        <Block>
          <Label icon={<Crown size={15} />}>What masters do</Label>
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
            In {master.games.toLocaleString()} master games from this position,{" "}
            <Mono>{master.yourMove.san}</Mono>{" "}
            {master.yourMove.rank === null ? (
              <>has never been played.</>
            ) : (
              <>
                is their #{master.yourMove.rank + 1} choice at{" "}
                {pct(master.yourMove.share)}%.
              </>
            )}
            {master.choices[0] && master.yourMove.rank !== 0 && (
              <>
                {" "}
                The main line is <Mono>{master.choices[0].san}</Mono>.
              </>
            )}
          </Typography>
        </Block>
      )}
    </>
  );
}

// ── Act 3 ────────────────────────────────────────────────────────────────────

function Drill({ state, line }: TrainerPanelProps) {
  const target = line.target;
  const review = state.mode === "review";
  return (
    <Block>
      <Label icon={<Target size={15} />}>{review ? "Review" : "Drill"}</Label>
      <Typography sx={{ ...TYPE.h5, color: TEXT.primary, mb: 1 }}>
        {review
          ? "You fixed this one. Still got it?"
          : "Play the line through."}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        {target
          ? `Your opponent answers as they really did. Play ${target.san} when you get there.`
          : "Your opponent answers as they really did."}
      </Typography>

      {state.feedback === "wrong" && state.lastWrong && (
        <Box
          role="status"
          sx={{
            mt: 2,
            p: 1.5,
            borderRadius: `${RADIUS.control}px`,
            border: `1px solid ${LINE.hairline}`,
            background: STATUS.errorTint,
          }}
        >
          <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
            <MastiAvatar
              mood="nervous"
              size={22}
              ring={false}
              animated
              loops={1}
              replayKey={state.lastWrong}
              style={{ verticalAlign: "middle", marginRight: 6 }}
            />
            <Mono>{state.lastWrong}</Mono> is the move we are replacing.
            {target && (
              <>
                {" "}
                Play <Mono>{target.san}</Mono>.
              </>
            )}
          </Typography>
        </Box>
      )}

      {/* A tally is only worth showing when there is something to accumulate.
          On a one-run review "0 clean runs banked" is noise dressed as
          progress. */}
      {!review && (
        <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 2 }}>
          {state.streak} clean {state.streak === 1 ? "run" : "runs"} banked
          {state.runs > state.streak ? ` · ${state.runs} attempted` : ""}
        </Typography>
      )}
    </Block>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function Done({ state, line, hole, nextReview }: TrainerPanelProps) {
  // A review that went clean is not a repair, and saying "Repaired" again
  // would claim work they did not just do.
  if (state.mode === "review") {
    const clean = state.misses === 0;
    return (
      <Block>
        <Masti
          mood={clean ? "excited" : "idea"}
          size={80}
          loops={2}
          decorative
          style={{ marginBottom: 8 }}
        />
        <Label icon={<Check size={15} />}>
          {clean ? "Still there" : "Needed a nudge"}
        </Label>
        <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 1 }}>
          {clean
            ? "Straight through, no prompting."
            : `You found it after ${state.misses} ${state.misses === 1 ? "miss" : "misses"}.`}
        </Typography>
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
          {clean
            ? "That is what sticking looks like. "
            : "Worth catching now rather than over the board. "}
          {nextReview ? `We will ask ${nextReview}.` : ""}
        </Typography>
      </Block>
    );
  }
  if (!hole) return null;
  return (
    <Block>
      <Masti
        mood="excited"
        size={80}
        loops={2}
        decorative
        style={{ marginBottom: 8 }}
      />
      <Label icon={<Check size={15} />}>Repaired</Label>
      <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 1 }}>
        {line.target
          ? `You played ${line.target.san} three times clean.`
          : "You have seen what this position costs you."}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        {line.target ? (
          <>
            The next time this comes up in a real game, you have a move to reach
            for. You score {pct(hole.score)}% here today; that is the number to
            watch.
            {nextReview
              ? ` We will check you still have it ${nextReview}.`
              : ""}
          </>
        ) : (
          <>
            There is no better move to drill: yours is sound. What costs you is
            the position that follows, so the work is understanding it.
          </>
        )}
      </Typography>
    </Block>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Label({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.85, mb: 1 }}>
      <Box
        sx={{ color: TEXT.secondary, display: "grid", placeItems: "center" }}
        aria-hidden
      >
        {icon}
      </Box>
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
        {children}
      </Typography>
    </Box>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <Box>
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
        {label}
      </Typography>
      <Typography
        sx={{
          ...TYPE.h5,
          color: tone === "bad" ? STATUS.error : TEXT.primary,
          // Tabular figures so a percentage changing does not shift the row.
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Primary({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    // The one primary action in the panel. The theme keeps the label's case,
    // so "Drill Nf3" stays a move.
    <Button
      variant="contained"
      fullWidth
      onClick={onClick}
      sx={{ minHeight: 44, gap: 1 }}
    >
      {children}
    </Button>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ fontFamily: FONT_MONO, color: TEXT.primary, fontWeight: 600 }}
    >
      {children}
    </Box>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        color: ACCENT.hover,
        "&:hover": { color: ACCENT.main },
        "&:focus-visible": {
          outline: `2px solid ${TEXT.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      {children}
    </Box>
  );
}
