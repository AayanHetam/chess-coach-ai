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
import { BookOpen, Check, ChevronRight, Dumbbell, History, Play, RotateCcw, Search } from "lucide-react";
import {
  formatLine,
  holeLine,
  rankHoles,
  type RepertoireHole,
  type RepertoireReport,
} from "@/lib/learn/repertoireHole";
import { isRepaired, loadSession } from "@/lib/learn/trainerProgress";
import { pullTrainerProgress } from "@/lib/learn/trainerSync";
import { reviewHref, trainerHref } from "@/lib/learn/trainerRoute";
import {
  dueCards,
  needsFullRepair,
  type ReviewCard,
} from "@/lib/learn/reviewSchedule";
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
  /** `platform:username`, for reading this account's training progress. */
  accountId?: string | null;
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
  accountId,
  onRun,
}: OpeningLineCardProps) {
  // The account's copy of the review schedule and the repaired list, merged
  // into this device's once.
  //
  // Local first: everything below renders from localStorage immediately and
  // this only ever ADDS. It is what makes a review due on your phone show up on
  // your laptop, and what stops a signed-in player on a fresh browser being
  // offered a drill they finished last week. The counter is the render key:
  // both readers below computed their answer from an empty store a tick ago.
  const synced = useTrainerSync(accountId ?? null);
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
        <Ready
          line={line}
          reports={reports}
          cachedAt={cachedAt}
          onRun={onRun}
          accountId={accountId ?? null}
          synced={synced}
        />
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
  accountId,
  synced,
}: {
  line: RepertoireHole | null;
  reports: RepertoireReport[];
  cachedAt: number | null;
  onRun: () => void;
  accountId: string | null;
  synced: number;
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
        {/* Reviews belong on BOTH sides of this branch. Having no leaking line
            left is the success case, and it is exactly when the only thing
            still worth doing is checking the lines you already fixed. Putting
            this after the early return would have made a clean repertoire
            silently swallow its own review queue. */}
        <DueForReview accountId={accountId} synced={synced} />
        <RunButton onClick={onRun} icon={<RotateCcw size={15} />} label="MEASURE AGAIN" />
      </>
    );
  }

  // The queue, in the same order the trainer would offer them. Ranked once,
  // centrally, so this list and the headline can never disagree about which
  // line matters most.
  const others = rankHoles(reports)
    .filter((h) => h !== line)
    .slice(0, 3);

  return (
    <>
      <LineBlock line={line} />

      {/* The card diagnoses; the trainer repairs. One primary action, and it is
          the one that changes something. Its wording follows the state, so a
          half-finished session is never hidden behind a button that reads like
          a fresh start. */}
      <TrainCta line={line} accountId={accountId} synced={synced} />

      {others.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <FieldLabel>Also leaking</FieldLabel>
          {/* Every one of these is trainable. Listing a measured weakness and
              then offering no way to act on it makes the card a report; the
              only difference between a report and a plan is whether the rows
              go anywhere. */}
          {others.map((h) => (
            <QueueRow key={`${h.color}-${h.fen}`} hole={h} />
          ))}
        </Box>
      )}
      <DueForReview accountId={accountId} synced={synced} />
      <Footer cachedAt={cachedAt} reports={reports} onRun={onRun} />
    </>
  );
}

/**
 * The one action, worded for where the player actually is.
 *
 * Read in an effect rather than during render: this is localStorage, and a
 * server render that guessed would hydrate into a different label.
 */
function TrainCta({
  line,
  accountId,
  synced,
}: {
  line: RepertoireHole;
  accountId: string | null;
  synced: number;
}) {
  const [status, setStatus] = useState<"fresh" | "resume" | "repaired">("fresh");

  useEffect(() => {
    if (!accountId) return;
    const key = holeLine(line);
    if (loadSession(accountId, key, Date.now())) setStatus("resume");
    else if (isRepaired(accountId, key)) setStatus("repaired");
    else setStatus("fresh");
  }, [accountId, line, synced]);

  const label =
    status === "resume" ? "RESUME TRAINING" : status === "repaired" ? "TRAIN IT AGAIN" : "FIX THIS LINE";
  const Icon = status === "resume" ? Play : status === "repaired" ? RotateCcw : Dumbbell;

  return (
    <Box sx={{ mt: 2.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      <Box
        component="a"
        href={trainerHref(line)}
        sx={{
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
        <Icon size={15} aria-hidden />
        {label}
      </Box>
      {status === "repaired" && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
          <Check size={14} color="#86EFAC" aria-hidden />
          <Typography sx={{ fontSize: "0.78rem", color: "#86EFAC" }}>Repaired</Typography>
        </Box>
      )}
    </Box>
  );
}

/** One trainable line in the queue. A whole row, so the target is the row. */
function QueueRow({ hole }: { hole: RepertoireHole }) {
  return (
    <Box
      component="a"
      href={trainerHref(hole)}
      aria-label={`Train ${formatLine(hole.line, hole.color)}`}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        // 44px of target, met with padding rather than by growing the text.
        minHeight: 44,
        px: 1,
        mx: -1,
        borderRadius: "10px",
        textDecoration: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        "&:last-of-type": { borderBottom: "none" },
        transition: "background 180ms ease",
        "&:hover": { background: "rgba(255,255,255,0.04)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: -2 },
      }}
    >
      <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>
        {formatLine(hole.line, hole.color)}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
          {pct(hole.score)}% · {hole.games} games
        </Typography>
        <ChevronRight size={14} color="rgba(255,255,255,0.35)" aria-hidden />
      </Box>
    </Box>
  );
}

/**
 * Pull the account's trainer progress once, and report when it has landed.
 *
 * The number is meaningless in itself; it changes exactly once, when a merge
 * brings something in, and that change is what re-runs the two readers below.
 * A boolean would work equally well — the counter is only so that a future
 * second pull is not silently swallowed by a flag that is already true.
 */
function useTrainerSync(accountId: string | null): number {
  const [synced, setSynced] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    void pullTrainerProgress(accountId).then((merged) => {
      if (merged) setSynced((n) => n + 1);
    });
  }, [accountId]);
  return synced;
}

/**
 * Lines that came back round.
 *
 * Read in an effect, like every other localStorage read on this card: a server
 * render that guessed would hydrate into a different list.
 *
 * Hidden entirely when nothing is due. An empty "0 due" row would be a
 * permanent reminder that there is nothing to remind them of.
 */
function DueForReview({ accountId, synced }: { accountId: string | null; synced: number }) {
  const [due, setDue] = useState<ReviewCard[]>([]);

  useEffect(() => {
    if (!accountId) return;
    setDue(dueCards(accountId, Date.now()));
  }, [accountId, synced]);

  if (due.length === 0) return null;
  return (
    <Box sx={{ mt: 2.5 }}>
      <FieldLabel>Due to check</FieldLabel>
      {due.map((card) => (
        <Box
          key={card.lineKey}
          component="a"
          href={reviewHref(card.lineKey, needsFullRepair(card))}
          aria-label={`Review ${card.label}`}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            minHeight: 44,
            px: 1,
            mx: -1,
            borderRadius: "10px",
            textDecoration: "none",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            "&:last-of-type": { borderBottom: "none" },
            transition: "background 180ms ease",
            "&:hover": { background: "rgba(255,255,255,0.04)" },
            "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: -2 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <History size={14} color="rgba(255,255,255,0.4)" aria-hidden />
            <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>
              {card.label}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
            {/* A line that keeps lapsing is not a review any more, and the
                link says so before they click it. */}
            {needsFullRepair(card) ? "train again" : "one clean run"}
          </Typography>
        </Box>
      ))}
    </Box>
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
