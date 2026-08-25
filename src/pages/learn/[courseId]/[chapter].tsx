// LEARN: one chapter, stepped through.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS SCREEN IS INSTEAD OF PROSE
//
// The product this replicates carries an author's paragraph at every move. We
// have none that is ours to write and will not generate one, so this shows the
// things a paragraph would otherwise be hiding: what people actually play here
// and how often, what the engine makes of the position, whether our move is the
// engine's own choice or merely the popular one, and where the line stops and
// why. Where Wikibooks reaches — 12.9% of decisions — its text is quoted
// verbatim under CC BY-SA, with attribution, and never rewritten.
//
// It is a READER, not a test. Everything is face up: our move is shown, not
// asked. Asking is the trainer's job and this hands off to it, which is the
// whole shape the founder chose — a reader BEFORE the confrontation.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { useAtomValue } from "jotai";
import { ChevronLeft, ChevronRight, Dumbbell, RotateCcw } from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";
import { pieceSetAtom } from "@/components/board/states";
import { Pill } from "@/components/courses/ChapterRow";
import { evalWords, numbered } from "@/lib/courses/lines";
import { sourceWords } from "@/lib/courses/probes";
import { branchesOf, defaultBranch, replay, type Branch } from "@/lib/courses/walk";
import { rarity } from "@/lib/repertoire/character";
import { fetchOpeningTheory } from "@/lib/theory/fetchOpeningTheory";
import type { OpeningTheory } from "@/types/theory";
import type { CourseNode, Termination } from "@/types/course";
import { endWords } from "@/lib/courses/lines";
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor } from "@/lib/repertoire/levels";
import { loadCourse } from "@/lib/courses/load";
import { viewFor } from "@/lib/courses/view";
import { unitsOf } from "@/lib/courses/hub";
import { chapterParam, courseTrainerHref, isCourseId } from "@/lib/learn/courseRoute";
import { drillHref, studyParam } from "@/lib/learn/courseHubRoute";
import type { Study } from "@/lib/courses/studies";

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface Props {
  courseId: string;
  courseName: string;
  side: "white" | "black";
  chapter: number;
  chapterLine: string[];
  chapterTitle: string | null;
  chapterShare: number;
  decisions: number;
  asked: number;
  studies: Study[];
  /** Only this chapter's nodes, plus the trunk every chapter shares. */
  nodes: Record<string, CourseNode>;
  /** Moves to open on, from the start of the game. */
  openAt: string[];
}

export default function ChapterReaderPage(props: Props) {
  const [sans, setSans] = useState<string[]>(props.openAt);
  const pieceSet = useAtomValue(pieceSetAtom);
  const [theory, setTheory] = useState<OpeningTheory | null>(null);

  // A different study through the same route is a different opening position.
  useEffect(() => setSans(props.openAt), [props.openAt]);

  const { fen, key, lastMove } = useMemo(() => replay(sans), [sans]);
  const node: CourseNode | undefined = props.nodes[key];
  const branches = useMemo(() => branchesOf(node, props.nodes), [node, props.nodes]);
  const forward = useMemo(() => defaultBranch(branches), [branches]);

  /** The chapter's own moves are the premise; back never leaves the chapter. */
  const floor = props.chapterLine.length;
  const canBack = sans.length > floor;

  const play = useCallback((branch: Branch) => setSans(prev => [...prev, branch.san]), []);
  const back = useCallback(
    () => setSans(prev => (prev.length > floor ? prev.slice(0, -1) : prev)),
    [floor]
  );
  const restart = useCallback(() => setSans(props.openAt), [props.openAt]);

  // Arrow keys, because this is a move list and every move list in chess has them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowRight" && forward) {
        e.preventDefault();
        play(forward);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, play, forward]);

  // The quote for this exact position. Absent means NOTHING rendered — no
  // placeholder, no stranded attribution line.
  useEffect(() => {
    setTheory(null);
    let live = true;
    fetchOpeningTheory([fen]).then(map => {
      if (live) setTheory(map.get(fen) ?? null);
    });
    return () => {
      live = false;
    };
  }, [fen]);

  const ourTurn = Boolean(node?.us);
  const title = props.chapterTitle ?? numbered(props.chapterLine);

  return (
    <>
      <Head>
        <title key="title">{`${title} — ${props.courseName} — Chess Masti`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />

      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 2, md: 4 } }}>
        <Box
          component={Link}
          href={`/learn/${props.courseId}`}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 44,
            color: "rgba(255,255,255,0.55)",
            fontSize: "0.85rem",
            textDecoration: "none",
            "&:hover": { color: "#fff" },
          }}
          data-testid="reader-back"
        >
          <ChevronLeft size={16} aria-hidden /> {props.courseName}
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 380px" },
            gap: { xs: 2, md: 3 },
            mt: 1,
            alignItems: "start",
          }}
        >
          {/* ── The board ─────────────────────────────────────────────────── */}
          <Box sx={{ display: "grid", gap: 1.5, justifyItems: "center", minWidth: 0 }}>
            <Box sx={{ width: "100%", maxWidth: 560 }}>
              <PuzzleBoardSurface
                fen={fen}
                orientation={props.side}
                interactive={false}
                onPieceDrop={() => false}
                pieceSet={pieceSet}
                lastMove={lastMove ?? undefined}
                animationMs={150}
                boardId="course-reader"
              />
            </Box>

            {/* The line so far, and the controls under it. */}
            <Box
              sx={{
                width: "100%",
                maxWidth: 560,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <IconButton onClick={back} disabled={!canBack} label="Previous move" testid="reader-back-move">
                <ChevronLeft size={18} aria-hidden />
              </IconButton>
              <IconButton
                onClick={() => forward && play(forward)}
                disabled={!forward}
                label="Next move"
                testid="reader-forward"
              >
                <ChevronRight size={18} aria-hidden />
              </IconButton>
              <IconButton onClick={restart} disabled={!canBack} label="Back to the start of the chapter" testid="reader-restart">
                <RotateCcw size={15} aria-hidden />
              </IconButton>
              <Typography
                data-testid="reader-line"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: MONO,
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.6,
                }}
              >
                {numbered(sans)}
              </Typography>
            </Box>
          </Box>

          {/* ── What is measured about this position ──────────────────────── */}
          <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
            <Box
              data-testid="reader-panel"
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: "1.5rem",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
                display: "grid",
                gap: 2,
              }}
            >
              {!node ? (
                <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.88rem", lineHeight: 1.6 }}>
                  The course stops here. Past this point nobody in the corpus went often enough for
                  us to call anything theory.
                </Typography>
              ) : ourTurn ? (
                <OurMove node={node} side={props.side} />
              ) : (
                <TheirReplies
                  branches={branches}
                  node={node}
                  onPlay={play}
                  side={props.side}
                />
              )}

              {node?.end && (
                <Box data-testid="reader-end">
                  <Label>The line stops</Label>
                  <Typography sx={{ color: "rgba(255,255,255,0.66)", fontSize: "0.86rem", mt: 0.5 }}>
                    {endWords(node.end as Termination)}
                  </Typography>
                </Box>
              )}

              {/* Verbatim, attributed, never rewritten. */}
              {theory && (
                <Box data-testid="reader-theory">
                  <Label>{theory.name ? `The theory — ${theory.name}` : "The theory"}</Label>
                  {theory.excerpt.split(/\n{2,}/).map((para, i) => (
                    <Typography
                      key={i}
                      sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.86rem", lineHeight: 1.7, mt: 0.75 }}
                    >
                      {para}
                    </Typography>
                  ))}
                  <Typography sx={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", mt: 0.75 }}>
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
            </Box>

            {/* ── Hand off ─────────────────────────────────────────────────── */}
            <Box
              sx={{
                p: 2,
                borderRadius: "1.5rem",
                border: `1px solid ${EMBER}2e`,
                background: `${EMBER}0d`,
                display: "grid",
                gap: 1.25,
              }}
            >
              <Typography sx={{ color: "#fff", fontSize: "0.92rem", fontWeight: 600 }}>
                I&rsquo;ve got this
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", lineHeight: 1.6 }}>
                {props.asked} {props.asked === 1 ? "decision" : "decisions"} in this chapter. The
                trainer asks before it teaches, so anything you already know it will not drill.
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Pill
                  href={courseTrainerHref(props.courseId, props.chapter)}
                  icon={<Dumbbell size={14} aria-hidden />}
                  ember
                  testid="reader-train"
                >
                  Train this chapter
                </Pill>
                <Pill href={drillHref(props.courseId, props.chapter)} testid="reader-drill">
                  Drill it
                </Pill>
              </Box>
            </Box>

            {/* Studies, when this chapter has them: jump the reader into one. */}
            {props.studies.length > 0 && (
              <Box
                data-testid="reader-studies"
                sx={{
                  p: 2,
                  borderRadius: "1.5rem",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                  display: "grid",
                  gap: 0.75,
                }}
              >
                <Label>Jump to</Label>
                {props.studies.map(study => (
                  <Box
                    key={study.id}
                    component="button"
                    data-testid={`reader-study-${study.id}`}
                    onClick={() => setSans(study.line)}
                    sx={{
                      appearance: "none",
                      border: "none",
                      background: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      minHeight: 44,
                      px: 1,
                      borderRadius: "0.75rem",
                      color: "rgba(255,255,255,0.8)",
                      fontSize: "0.84rem",
                      "&:hover": { background: "rgba(255,255,255,0.05)", color: "#fff" },
                      "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: -2 },
                    }}
                  >
                    {study.title}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}

/** Our move, and everything that is true about it. */
function OurMove({ node, side }: { node: CourseNode; side: "white" | "black" }) {
  const source = node.src ? sourceWords(node.src) : null;
  const words = evalWords(node.ev?.cp ?? null, side);
  return (
    <Box data-testid="reader-our-move">
      <Label>You play</Label>
      <Typography sx={{ fontFamily: MONO, fontSize: "1.6rem", color: EMBER, mt: 0.5 }}>
        {node.us}
      </Typography>
      <Box sx={{ display: "grid", gap: 0.5, mt: 1.25 }}>
        {/* Said only when it deviates from the ordinary case — 97.6% of our
            moves are the engine's choice AND the popular one, and printing that
            on every card is wallpaper, not information. */}
        {source && <Line>{source}</Line>}
        {node.loss !== undefined && node.loss > 0 && (
          <Line>{node.loss} centipawns behind the engine&rsquo;s own choice</Line>
        )}
        {words && <Line>{words}</Line>}
        {node.g > 0 && <Line>{node.g.toLocaleString()} games reach this position</Line>}
      </Box>
    </Box>
  );
}

/** What they play, in the proportions they play it. */
function TheirReplies({
  branches,
  node,
  onPlay,
  side,
}: {
  branches: Branch[];
  node: CourseNode;
  onPlay: (b: Branch) => void;
  side: "white" | "black";
}) {
  const words = evalWords(node.ev?.cp ?? null, side);
  if (branches.length === 0) {
    return (
      <Box data-testid="reader-their-move">
        <Label>Their move</Label>
        <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.86rem", mt: 0.75 }}>
          Nothing here reaches the share this course covers.
        </Typography>
      </Box>
    );
  }
  return (
    <Box data-testid="reader-their-move">
      <Label>They play</Label>
      <Box sx={{ display: "grid", gap: 0.5, mt: 0.75 }}>
        {branches.map(branch => {
          const pct = Math.round((branch.share ?? 0) * 100);
          const rare = branch.share !== undefined ? rarity(branch.share) : null;
          return (
            <Box
              key={branch.san}
              component="button"
              data-testid={`reader-reply-${branch.san}`}
              onClick={() => onPlay(branch)}
              sx={{
                appearance: "none",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.22)",
                borderRadius: "0.9rem",
                cursor: "pointer",
                textAlign: "left",
                minHeight: 48,
                px: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                transition: "background 200ms ease-out, border-color 200ms ease-out",
                "&:hover": { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.18)" },
                "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
              }}
            >
              <Typography sx={{ fontFamily: MONO, fontSize: "0.95rem", color: "#fff", minWidth: 62 }}>
                {branch.san}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <Box
                    component={motion.div}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, pct)}%` }}
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    sx={{ height: "100%", background: "rgba(255,255,255,0.34)" }}
                  />
                </Box>
                {rare && (
                  <Typography sx={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.36)", mt: 0.4 }}>
                    {rare}
                  </Typography>
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.6)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 38,
                  textAlign: "right",
                }}
              >
                {pct}%
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: "grid", gap: 0.5, mt: 1.25 }}>
        {/*
          Reply coverage, said only when it is not the whole story. `rc` is the
          share of real play these replies account for — a sum below 1 is normal
          and says nothing on its own, so the sentence names what is missing
          rather than implying the list is everything.
        */}
        {node.rc !== undefined && node.rc < 0.97 && (
          <Line>
            These are {Math.round(node.rc * 100)}% of what people play here; the rest is spread too
            thin to teach
          </Line>
        )}
        {words && <Line>{words}</Line>}
      </Box>
    </Box>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.45)",
      }}
    >
      {children}
    </Typography>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", lineHeight: 1.6 }}>
      {children}
    </Typography>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  testid,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testid}
      sx={{
        appearance: "none",
        display: "grid",
        placeItems: "center",
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: "0.9rem",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        color: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.8)",
        cursor: disabled ? "default" : "pointer",
        transition: "background 200ms ease-out",
        "&:hover": { background: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.09)" },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >
      {children}
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ctx => {
  const raw = Array.isArray(ctx.params?.courseId) ? ctx.params?.courseId[0] : ctx.params?.courseId;
  const chapter = chapterParam(ctx.params?.chapter);
  if (!isCourseId(raw) || chapter === null) return { notFound: true };

  const course = loadCourse(raw);
  if (!course) return { notFound: true };

  // The band comes from the account, never from the request.
  let rating: number | undefined;
  try {
    const session = await getSessionFromCookieHeader(ctx.req.headers.cookie);
    if (session?.uid) {
      const user = await getUserById(session.uid);
      rating = resolveUserRating(user);
    }
  } catch {
    rating = undefined;
  }

  const view = viewFor(course, bandFor(rating));
  const chapterView = view.chapters.find(c => c.i === chapter);
  if (!chapterView) return { notFound: true };

  const unit = unitsOf(view, course.meta.side).find(u => u.i === chapter)!;

  // This chapter's nodes and the trunk they all share — never the whole course.
  // The cut has already happened in `viewFor`; this is the second half of the
  // same rule, that a page is sent what it renders and nothing else.
  const nodes: Record<string, CourseNode> = {};
  for (const [key, node] of Object.entries(view.nodes)) {
    if (node.ch === chapter || node.ch === -1) nodes[key] = node;
  }

  // `?study=` opens on a study rather than at the top of the chapter.
  const study = studyParam(ctx.query.study);
  const opened = study ? unit.studies.find(s => s.id === study) : undefined;

  ctx.res.setHeader("Cache-Control", "private, no-store");
  return {
    props: {
      courseId: raw,
      courseName: course.meta.name,
      side: course.meta.side,
      chapter,
      chapterLine: chapterView.line,
      chapterTitle: chapterView.title,
      chapterShare: chapterView.share,
      decisions: unit.decisions,
      asked: unit.asked,
      studies: unit.studies,
      nodes,
      openAt: opened ? opened.line : chapterView.line,
    },
  };
};
