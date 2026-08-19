"use client";

// The teaching panel. One column, one act at a time.
//
// It is deliberately EMPTY in the first act except for the instruction. A panel
// that shows the answer before the question is a panel that gets read instead
// of the board, and the whole point of the first act is that the player moves
// before they are told anything.

import { Box, Button, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Check, Crown, Target } from "lucide-react";
import type { RepertoireHole } from "@/lib/learn/repertoireHole";
import type { TrainerLine, TrainerState } from "@/lib/learn/trainerSession";
import type { MasterView } from "@/lib/master/ideas";
import type { OpeningTheory } from "@/types/theory";

const EMBER = "#FB923C";
const BAD = "#FCA5A5";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
const pct = (v: number) => Math.round(v * 100);

export interface TrainerPanelProps {
  state: TrainerState;
  line: TrainerLine;
  hole: RepertoireHole;
  theory: OpeningTheory | null;
  master: MasterView | null;
  onAdvance: () => void;
  onExit: () => void;
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
        borderRadius: "1.5rem",
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(20,22,28,0.92) 0%, rgba(12,14,20,0.92) 100%)",
        backdropFilter: "blur(12px)",
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
        {state.act === "confront" && <Confront {...props} />}
        {state.act === "learn" && <Learn {...props} />}
        {state.act === "drill" && <Drill {...props} />}
        {state.act === "done" && <Done {...props} />}
      </Box>
      <PanelAction {...props} />
    </Box>
  );
}

/**
 * The one action for the current act, pinned to the panel floor.
 *
 * A hairline and a short gradient above it so the scrolling content reads as
 * continuing underneath rather than as ending abruptly.
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
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background:
          "linear-gradient(180deg, rgba(12,14,20,0) 0%, rgba(12,14,20,0.9) 40%)",
      }}
    >
      <Primary onClick={isLearn ? onAdvance : onExit}>
        {isLearn ? (line.target ? `Drill ${line.target.san}` : "Finish") : "Back to your plan"}
        <ArrowRight size={16} aria-hidden />
      </Primary>
    </Box>
  );
}

/** Entrance for each block. Opacity survives reduced-motion; the rise does not. */
const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
};

function Block({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div {...rise} transition={{ ...rise.transition, delay }}>
      {children}
    </motion.div>
  );
}

// ── Act 1 ────────────────────────────────────────────────────────────────────

function Confront({ hole }: TrainerPanelProps) {
  return (
    <Block>
      <Label icon={<Target size={15} />}>Your move</Label>
      <Typography sx={{ color: "#fff", fontSize: "1.05rem", fontWeight: 600, mb: 1, lineHeight: 1.4 }}>
        Play the move you normally play here.
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.88rem", lineHeight: 1.6 }}>
        You have reached this position {hole.games} times. Play it the way you
        would in a real game, and we will look at what happened next.
      </Typography>
    </Block>
  );
}

// ── Act 2 ────────────────────────────────────────────────────────────────────

function Learn({ state, hole, theory, master, line }: TrainerPanelProps) {
  const played = state.confrontMove ?? "";
  return (
    <>
      <Block>
        <Label icon={<Target size={15} />}>Your record here</Label>
        {state.playedHabit ? (
          <Typography sx={{ color: "#fff", fontSize: "1rem", lineHeight: 1.5, mb: 1.5 }}>
            You played <Mono>{played}</Mono>, which is what you play here.
          </Typography>
        ) : (
          // They did not reproduce the habit. Saying "you always play X" now
          // would be a claim contradicted by the move on the board.
          <Typography sx={{ color: "#fff", fontSize: "1rem", lineHeight: 1.5, mb: 1.5 }}>
            You played <Mono>{played}</Mono>. Your games say you usually play{" "}
            <Mono>{line.moves[line.moves.length - 1]}</Mono> here.
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", mb: 0.5 }}>
          <Stat label="You score" value={`${pct(hole.score)}%`} tone="bad" />
          <Stat label="Your average" value={`${pct(hole.baseline)}%`} />
          <Stat label="Games" value={String(hole.games)} />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", mt: 1 }}>
          {hole.tier === "confirmed"
            ? "Confirmed: this survived a correction across every line we tested."
            : "Signal: the evidence is real but short of proof at this sample."}
        </Typography>
      </Block>

      <Block delay={0.04}>
        <Label icon={<Crown size={15} />}>The verdict</Label>
        <Typography sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.92rem", lineHeight: 1.65 }}>
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
        <Block delay={0.08}>
          <Label icon={<BookOpen size={15} />}>
            {theory.name ? `The theory — ${theory.name}` : "The theory"}
          </Label>
          {theory.excerpt.split(/\n{2,}/).map((para, i) => (
            <Typography
              key={i}
              sx={{
                color: "rgba(255,255,255,0.72)",
                fontSize: "0.88rem",
                lineHeight: 1.7,
                mt: i === 0 ? 0 : 1,
              }}
            >
              {para}
            </Typography>
          ))}
          <Typography sx={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", mt: 1.25 }}>
            From{" "}
            <Link href={theory.sourceUrl}>Wikibooks</Link>, licensed{" "}
            <Link href={theory.licenceUrl}>{theory.licence}</Link>.
          </Typography>
        </Block>
      )}

      {master && master.yourMove && (
        <Block delay={0.12}>
          <Label icon={<Crown size={15} />}>What masters do</Label>
          <Typography sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.88rem", lineHeight: 1.65 }}>
            In {master.games.toLocaleString()} master games from this position,{" "}
            <Mono>{master.yourMove.san}</Mono>{" "}
            {master.yourMove.rank === null ? (
              <>has never been played.</>
            ) : (
              <>
                is their #{master.yourMove.rank + 1} choice at {pct(master.yourMove.share)}%.
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
  return (
    <Block>
      <Label icon={<Target size={15} />}>Drill</Label>
      <Typography sx={{ color: "#fff", fontSize: "1.05rem", fontWeight: 600, lineHeight: 1.4, mb: 1 }}>
        Play the line through.
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.88rem", lineHeight: 1.6 }}>
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
            borderRadius: "12px",
            border: `1px solid ${BAD}44`,
            background: `${BAD}11`,
          }}
        >
          <Typography sx={{ color: BAD, fontSize: "0.86rem", lineHeight: 1.55 }}>
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

      <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", mt: 2 }}>
        {state.streak} clean {state.streak === 1 ? "run" : "runs"} banked
        {state.runs > state.streak ? ` · ${state.runs} attempted` : ""}
      </Typography>
    </Block>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function Done({ line, hole }: TrainerPanelProps) {
  return (
    <Block>
      <Label icon={<Check size={15} />}>Repaired</Label>
      <Typography sx={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.4, mb: 1 }}>
        {line.target
          ? `You played ${line.target.san} three times clean.`
          : "You have seen what this position costs you."}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", lineHeight: 1.65 }}>
        {line.target ? (
          <>
            The next time this comes up in a real game, you have a move to reach
            for. You score {pct(hole.score)}% here today; that is the number to
            watch.
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

function Label({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.85, mb: 1 }}>
      <Box sx={{ color: EMBER, display: "grid", placeItems: "center" }} aria-hidden>
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: "0.66rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.35)",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: "1.05rem",
          fontWeight: 700,
          color: tone === "bad" ? BAD : "rgba(255,255,255,0.9)",
          // Tabular figures so a percentage changing does not shift the row.
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      sx={{
        width: "100%",
        minHeight: 44,
        px: 2.25,
        borderRadius: "12px",
        // Ember as glow, never as fill.
        border: `1px solid ${EMBER}77`,
        color: EMBER,
        background: `${EMBER}0F`,
        fontSize: "0.86rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        // MUI uppercases button labels by default, which turns "Nf3" into
        // "NF3" — not a move. Chess notation is case-bearing.
        textTransform: "none",
        gap: 1,
        transition: "background 180ms ease, border-color 180ms ease",
        "&:hover": { background: `${EMBER}1F`, borderColor: EMBER },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      {children}
    </Button>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: MONO, color: "#fff", fontWeight: 600 }}>
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
        color: "rgba(249,115,22,0.75)",
        "&:hover": { color: EMBER },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      {children}
    </Box>
  );
}
