"use client";

// The line in your own games that costs you the most.
//
// Every number on this card is counted or computed — no model writes any of it.
// The wording is load-bearing in one specific way: a claim about a real person's
// play has to carry the evidence it rests on, and the three states it can be in
// (measured, suspected, not enough games) must never be allowed to read as each
// other. "You have no measurable weakness" and "we could not measure you" are
// opposite instructions to the reader.

import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { BookOpen, Dumbbell, RotateCcw, Search } from "lucide-react";
import {
  formatLine,
  type RepertoireHole,
  type RepertoireReport,
} from "@/lib/learn/repertoireHole";
import { fetchMasterViews } from "@/lib/master/useMasterIdeas";
import { fetchOpeningTheory } from "@/lib/theory/fetchOpeningTheory";
import type { MasterView } from "@/lib/master/ideas";
import type { OpeningTheory } from "@/types/theory";

const EMBER = "#FB923C";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

const pct = (v: number) => Math.round(v * 100);

export interface OpeningLineCardProps {
  phase: "idle" | "fetching" | "building" | "ready" | "error";
  label: string;
  reports: RepertoireReport[];
  line: RepertoireHole | null;
  error: string | null;
  cachedAt: number | null;
  /** Null when no chess.com / Lichess account is linked. */
  username: string | null;
  onRun: () => void;
}

export default function OpeningLineCard({
  phase,
  label,
  reports,
  line,
  error,
  cachedAt,
  username,
  onRun,
}: OpeningLineCardProps) {
  return (
    <Box id="opening-line" sx={{ scrollMarginTop: "80px" }}>
      <Header />

      {!username ? (
        <Body>
          Link a chess.com or Lichess account and we can find the opening line
          your own results say is costing you the most.
        </Body>
      ) : phase === "error" ? (
        <Body tone="warn">{error}</Body>
      ) : phase === "fetching" || phase === "building" ? (
        <Body>{label}…</Body>
      ) : phase === "ready" ? (
        <Ready line={line} reports={reports} cachedAt={cachedAt} onRun={onRun} />
      ) : (
        <Idle onRun={onRun} />
      )}
    </Box>
  );
}

function Header() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
      <BookOpen size={18} color={EMBER} strokeWidth={2} />
      <Typography
        sx={{
          color: "rgba(255,255,255,0.9)",
          fontWeight: 700,
          fontSize: "1rem",
        }}
      >
        Your weakest line
      </Typography>
    </Box>
  );
}

function Body({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <Typography
      sx={{
        color: tone === "warn" ? "#FCA5A5" : "rgba(255,255,255,0.55)",
        fontSize: "0.88rem",
        lineHeight: 1.55,
      }}
    >
      {children}
    </Typography>
  );
}

function Idle({ onRun }: { onRun: () => void }) {
  return (
    <>
      <Body>
        We read your last year of games, pool them by position, and find where
        you score furthest below your own average. Takes about half a minute.
      </Body>
      <RunButton onClick={onRun} icon={<Search size={15} />} label="FIND MY WEAKEST LINE" />
    </>
  );
}

function RunButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      onClick={onClick}
      sx={{
        mt: 1.75,
        px: 2,
        py: 0.85,
        borderRadius: "10px",
        border: "1px solid rgba(249,115,22,0.45)",
        color: EMBER,
        fontSize: "0.75rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        gap: 0.85,
        "&:hover": {
          background: "rgba(249,115,22,0.1)",
          borderColor: "rgba(249,115,22,0.7)",
        },
      }}
    >
      {icon}
      {label}
    </Button>
  );
}

function Ready({
  line,
  reports,
  cachedAt,
  onRun,
}: {
  line: RepertoireHole | null;
  reports: RepertoireReport[];
  cachedAt: number | null;
  onRun: () => void;
}) {
  // Nothing to show splits two ways, and collapsing them would tell half these
  // users the opposite of the truth.
  if (!line) {
    const measured = reports.some((r) => !r.insufficientData && r.tests > 0);
    return (
      <>
        <Body>
          {measured
            ? "We looked at both colours and found no line where you score measurably below your own average. That is a good result, not a missing one — your losses are not concentrated in one opening."
            : "Not enough games yet to measure a repertoire. Positions need to repeat before a score in them means anything."}
        </Body>
        <RunButton onClick={onRun} icon={<RotateCcw size={15} />} label="MEASURE AGAIN" />
      </>
    );
  }

  const others = reports
    .flatMap((r) => r.holes)
    .filter((h) => h !== line)
    .slice(0, 3);

  return (
    <>
      <LineBlock line={line} />

      {/* The card diagnoses; the trainer repairs. One primary action, and it is
          the one that changes something. */}
      <Box
        component="a"
        href="/train/opening"
        sx={{
          mt: 2.5,
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          minHeight: 44,
          px: 2.25,
          borderRadius: "12px",
          border: "1px solid rgba(249,115,22,0.5)",
          background: "rgba(249,115,22,0.08)",
          color: EMBER,
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textDecoration: "none",
          transition: "background 180ms ease, border-color 180ms ease",
          "&:hover": { background: "rgba(249,115,22,0.16)", borderColor: EMBER },
          "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
        }}
      >
        <Dumbbell size={15} aria-hidden />
        FIX THIS LINE
      </Box>

      {others.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <FieldLabel>Also leaking</FieldLabel>
          {others.map((h) => (
            <Box
              key={`${h.color}-${h.fen}`}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                py: 0.6,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                "&:last-of-type": { borderBottom: "none" },
              }}
            >
              <Typography
                sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}
              >
                {formatLine(h.line, h.color)}
              </Typography>
              <Typography
                sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}
              >
                {pct(h.score)}% · {h.games} games
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Footer cachedAt={cachedAt} reports={reports} onRun={onRun} />
    </>
  );
}

function LineBlock({ line }: { line: RepertoireHole }) {
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.25 }}>
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: "1.05rem",
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {formatLine(line.line, line.color)}
        </Typography>
        <TierPill tier={line.tier} />
        <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
          as {line.color === "white" ? "White" : "Black"}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 1.5 }}>
        <Stat label="You score here" value={`${pct(line.score)}%`} tone="bad" />
        <Stat label="Your average" value={`${pct(line.baseline)}%`} />
        <Stat label="Games" value={String(line.games)} />
        <Stat label="p" value={line.p < 0.001 ? "<0.001" : line.p.toFixed(3)} />
      </Box>

      <Diagnosis line={line} />
      <TheoryNote line={line} />
      <MasterNote line={line} />
    </>
  );
}

/**
 * What to actually do about it.
 *
 * The engine is only allowed to name a replacement when it disagrees by enough
 * to matter. Below that bar the honest reading is that the move was fine and the
 * structure is the problem — which is the finding the whole scout programme
 * rests on, and the one an engine cannot see on its own.
 */
function Diagnosis({ line }: { line: RepertoireHole }) {
  const move = line.line[line.line.length - 1].san;
  return (
    <Typography
      sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.88rem", lineHeight: 1.6 }}
    >
      {line.diagnosis === "move" ? (
        <>
          Your <Mono>{move}</Mono> throws away about{" "}
          <Mono>{Math.round(line.cpLoss ?? 0)}cp</Mono>. The engine would rather
          you played <Mono>{line.betterMove}</Mono>.
        </>
      ) : (
        <>
          <Mono>{move}</Mono> is a sound move — the engine has no complaint. You
          simply do badly in what comes after it, which usually means the
          structure does not suit you rather than that you blundered.
        </>
      )}
    </Typography>
  );
}

/**
 * What the book says about the position you keep reaching.
 *
 * The text is CC BY-SA 4.0 from Wikibooks and is shown VERBATIM — share-alike
 * attaches to adapted material, so quoting is free and rewriting is not. It is
 * also the safer choice on accuracy: nothing here is generated, so nothing here
 * can be confidently wrong about a position.
 *
 * Attribution is not decoration. The licence requires crediting the source with
 * a link back to the exact page, so the footer below is load-bearing and must
 * not be trimmed for space.
 */
function TheoryNote({ line }: { line: RepertoireHole }) {
  const [theory, setTheory] = useState<OpeningTheory | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOpeningTheory([line.fen]).then((byFen) => {
      if (!cancelled) setTheory(byFen.get(line.fen) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [line]);

  if (!theory) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <FieldLabel>
        {theory.name ? `The theory — ${theory.name}` : "The theory"}
        {theory.eco ? ` · ${theory.eco}` : ""}
      </FieldLabel>
      {theory.excerpt.split(/\n{2,}/).map((para, i) => (
        <Typography
          key={i}
          sx={{
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.86rem",
            lineHeight: 1.65,
            mt: i === 0 ? 0.5 : 1,
          }}
        >
          {para}
        </Typography>
      ))}
      <Typography sx={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", mt: 1 }}>
        From{" "}
        <Box
          component="a"
          href={theory.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: "rgba(249,115,22,0.75)", "&:hover": { color: EMBER } }}
        >
          Wikibooks
        </Box>
        , licensed{" "}
        <Box
          component="a"
          href={theory.licenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: "rgba(249,115,22,0.75)", "&:hover": { color: EMBER } }}
        >
          {theory.licence}
        </Box>
        .
      </Typography>
    </Box>
  );
}

/**
 * What strong players do with the same decision.
 *
 * Fetched separately and allowed to be absent: the corpus either has the
 * position or it does not, and a miss must not disturb a measurement that is
 * already complete.
 */
function MasterNote({ line }: { line: RepertoireHole }) {
  const [view, setView] = useState<MasterView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const move = line.line[line.line.length - 1].san;
    void fetchMasterViews([{ fen: line.parentFen, yourMove: move }], line.color).then((ctx) => {
      if (!cancelled) setView(ctx.byFen.get(line.parentFen) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [line]);

  if (!view) return null;

  const mine = view.yourMove;
  const main = view.choices[0];

  return (
    <Box
      sx={{
        mt: 1.75,
        pl: 1.5,
        borderLeft: "2px solid rgba(249,115,22,0.35)",
      }}
    >
      <Typography
        sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.84rem", lineHeight: 1.6 }}
      >
        In {view.games.toLocaleString()} master games from this position
        {mine ? (
          mine.rank === null ? (
            <>
              , <Mono>{mine.san}</Mono> has never been played.
            </>
          ) : (
            <>
              , <Mono>{mine.san}</Mono> is their #{mine.rank + 1} choice at{" "}
              {pct(mine.share)}%.
            </>
          )
        ) : (
          "."
        )}
        {main && (!mine || mine.rank !== 0) && (
          <>
            {" "}
            The main line is <Mono>{main.san}</Mono>.
          </>
        )}
      </Typography>
    </Box>
  );
}

function Footer({
  cachedAt,
  reports,
  onRun,
}: {
  cachedAt: number | null;
  reports: RepertoireReport[];
  onRun: () => void;
}) {
  const games = reports.reduce((a, r) => a + r.baselineGames, 0);
  const tests = reports.reduce((a, r) => a + r.tests, 0);
  return (
    <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      <Typography sx={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.35)" }}>
        {games.toLocaleString()} of your games · {tests} independent lines tested
        {cachedAt ? ` · measured ${new Date(cachedAt).toLocaleDateString()}` : ""}
      </Typography>
      <Box
        component="button"
        onClick={onRun}
        sx={{
          background: "none",
          border: "none",
          p: 0,
          cursor: "pointer",
          fontSize: "0.73rem",
          color: "rgba(249,115,22,0.75)",
          "&:hover": { color: EMBER },
        }}
      >
        measure again
      </Box>
    </Box>
  );
}

function TierPill({ tier }: { tier: RepertoireHole["tier"] }) {
  const confirmed = tier === "confirmed";
  return (
    <Box
      sx={{
        px: 0.9,
        py: 0.2,
        borderRadius: "6px",
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: confirmed ? "#86EFAC" : "rgba(255,255,255,0.5)",
        border: `1px solid ${confirmed ? "rgba(134,239,172,0.35)" : "rgba(255,255,255,0.15)"}`,
      }}
    >
      {confirmed ? "CONFIRMED" : "SIGNAL"}
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
      <FieldLabel>{label}</FieldLabel>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: "0.95rem",
          fontWeight: 700,
          color: tone === "bad" ? "#FCA5A5" : "rgba(255,255,255,0.85)",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: "0.65rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
        mb: 0.3,
      }}
    >
      {children}
    </Typography>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: MONO, color: "rgba(255,255,255,0.92)" }}>
      {children}
    </Box>
  );
}
