import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronDown, Dumbbell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor } from "@/lib/repertoire/levels";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { lineNotes, linesOf, numbered, type CourseLine } from "@/lib/courses/lines";
import { probesOf } from "@/lib/courses/probes";
import { courseTrainerHref } from "@/lib/learn/courseRoute";
import type { CourseChapter, CourseNode, MoveSource } from "@/types/course";

/**
 * One opening course, read rather than drilled.
 *
 * The trainer is where a course is LEARNED; this is where it is chosen and
 * understood. It exists first because 43 courses that nothing links to are data,
 * not product.
 *
 * Everything on this page is measured. There is no prose about the opening
 * anywhere, because we have none that is ours to write: the lines come from the
 * corpus and the engine, the evaluation comes from the CC0 dump, and where a
 * line stops is a fact about the data rather than a claim about the position.
 */

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface CourseResponse {
  meta: {
    id: string;
    name: string;
    root: string[];
    side: "white" | "black";
    lines: number;
    corpus: { source: string; games: number };
    evals: { source: string; licence: string; covered: number; of: number };
    bySource: Partial<Record<MoveSource, number>>;
  };
  band: string;
  maxPly: number;
  theoryPlies: number;
  chapters: CourseChapter[];
  nodes: Record<string, CourseNode>;
  covered: number;
  omitted: { chapters: number; share: number };
  verdict: string;
}

export default function CoursePage() {
  const router = useRouter();
  const courseId = typeof router.query.courseId === "string" ? router.query.courseId : null;
  const { profile } = useAuth();
  const rating = resolveUserRating(profile);
  const band = useMemo(() => bandFor(rating), [rating]);

  const [course, setCourse] = useState<CourseResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [openChapter, setOpenChapter] = useState<number | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let live = true;
    setState("loading");
    fetch(`/api/opening-courses/${encodeURIComponent(courseId)}?band=${band.id}`)
      .then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (!live) return;
        if (!data) return setState("missing");
        setCourse(data);
        setOpenChapter(data.chapters[0]?.i ?? null);
        setState("ready");
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [courseId, band.id]);

  /**
   * How many decisions the open chapter would ask.
   *
   * Computed only for the chapter that is open: probesOf walks the graph with
   * chess.js, and doing it for every chapter on every render would replay the
   * whole course to render a row of headers.
   */
  const chapterProbeCount = useCallback(
    (chapter: CourseChapter) =>
      course
        ? probesOf(
            { meta: course.meta as never, chapters: course.chapters, nodes: course.nodes },
            chapter.i,
            course.meta.side
          ).probes.length
        : 0,
    [course]
  );

  const chapterLines = useCallback(
    (chapter: CourseChapter) =>
      course
        ? linesOf({ nodes: course.nodes }, chapter.at, chapter.line)
        : { lines: [] as CourseLine[], total: 0, capped: false },
    [course]
  );

  return (
    <>
      <Head>
        <title>{course ? `${course.meta.name} — Chess Masti` : "Opening course — Chess Masti"}</title>
      </Head>
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
        <Box
          component={Link}
          href="/learn"
          sx={{
            display: "inline-flex", alignItems: "center", gap: 0.75, mb: 3,
            color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", textDecoration: "none",
            "&:hover": { color: "#fff" },
          }}
        >
          <ArrowLeft size={15} /> Your repertoire
        </Box>

        {state === "loading" && <Note>Opening the course…</Note>}
        {state === "missing" && <Note>There is no course by that name.</Note>}
        {state === "failed" && (
          <Note>The course is not loading. Nothing is lost — try again in a moment.</Note>
        )}

        {state === "ready" && course && (
          <>
            <Box sx={{ display: "flex", gap: 2.5, alignItems: "flex-start", mb: 2.5 }}>
              <OpeningDiagram moves={course.meta.root} side={course.meta.side} px={104} />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h1" sx={{ color: "#fff", fontSize: { xs: "1.5rem", md: "1.9rem" }, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {course.meta.name}
                </Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: "0.85rem", color: EMBER, mt: 0.5 }}>
                  {numbered(course.meta.root)}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", mt: 1, lineHeight: 1.6 }}>
                  {course.verdict}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gap: 1.25 }}>
              {course.chapters.map((chapter) => {
                const open = openChapter === chapter.i;
                const { lines, total, capped } = open
                  ? chapterLines(chapter)
                  : { lines: [] as CourseLine[], total: 0, capped: false };
                return (
                  <Box
                    key={chapter.i}
                    sx={{
                      borderRadius: "1.5rem",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      component="button"
                      onClick={() => setOpenChapter(open ? null : chapter.i)}
                      aria-expanded={open}
                      sx={{
                        appearance: "none", background: "none", border: "none", width: "100%",
                        display: "flex", alignItems: "center", gap: 1.5, textAlign: "left",
                        px: 2, py: 1.75, cursor: "pointer", color: "inherit",
                        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: -2 },
                      }}
                    >
                      <OpeningDiagram moves={chapter.line} side={course.meta.side} px={52} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontFamily: MONO, fontSize: "0.85rem", color: "#fff" }}>
                          {numbered(chapter.line)}
                        </Typography>
                        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", mt: 0.3 }}>
                          {Math.round(chapter.share * 100)}% of what you meet here
                        </Typography>
                      </Box>
                      <Box component={motion.div} animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
                        <ChevronDown size={16} color="rgba(255,255,255,0.4)" />
                      </Box>
                    </Box>

                    {open && (
                      <Box sx={{ px: 2, pb: 2, display: "grid", gap: 0.75 }}>
                        <ChapterTrainLink
                          courseId={courseId ?? ""}
                          chapter={chapter.i}
                          count={chapterProbeCount(chapter)}
                        />
                        {lines.map((line, i) => (
                          <Box
                            key={i}
                            component={motion.div}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                            sx={{
                              p: 1.25, borderRadius: "10px",
                              background: "rgba(0,0,0,0.25)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <Typography sx={{ fontFamily: MONO, fontSize: "0.8rem", color: "rgba(255,255,255,0.9)", lineHeight: 1.7 }}>
                              {numbered(line.moves)}
                            </Typography>
                            {lineNotes(line, course.meta.side).length > 0 && (
                              <Typography sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.74rem", mt: 0.4 }}>
                                {lineNotes(line, course.meta.side).join(" · ")}
                              </Typography>
                            )}
                          </Box>
                        ))}
                        {lines.length === 0 && (
                          <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>
                            Nothing below this at your level yet.
                          </Typography>
                        )}
                        {/* Never a silent cut. A list that stops at 60 of 300
                            claims a completeness it does not have. */}
                        {capped && (
                          <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.76rem", mt: 0.5 }}>
                            Showing the {lines.length} most likely of {total} lines in this chapter.
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Provenance. A course that cannot say where its moves came from
                cannot be argued with, and every claim on this page is checkable. */}
            <Typography sx={{ mt: 4, fontSize: "0.74rem", color: "rgba(255,255,255,0.33)", lineHeight: 1.7 }}>
              Your moves are chosen by the engine and checked against{" "}
              {course.meta.corpus.games.toLocaleString()} games ({course.meta.corpus.source}); their
              replies are what people actually play. Evaluations from{" "}
              {course.meta.evals.source} ({course.meta.evals.licence}), covering{" "}
              {Math.round((course.meta.evals.covered / Math.max(1, course.meta.evals.of)) * 100)}% of
              this course. Shown to {course.theoryPlies} plies, the depth for your level.
            </Typography>
          </>
        )}
      </Box>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.95rem", py: 6 }}>
      {children}
    </Typography>
  );
}

/**
 * Into the trainer, from the chapter you are looking at.
 *
 * Inside the panel rather than in the header, because the header is a button
 * and a link nested in a button is neither. Reading the chapter and being asked
 * about it are one gesture apart, which is the whole point of the reader.
 *
 * Absent when the chapter asks nothing, rather than rendering a button that
 * leads to an empty session.
 */
function ChapterTrainLink({
  courseId,
  chapter,
  count,
}: {
  courseId: string;
  chapter: number;
  count: number;
}) {
  if (!courseId || count <= 0) return null;
  return (
    <Link
      href={courseTrainerHref(courseId, chapter)}
      style={{ textDecoration: "none" }}
      data-testid={`train-chapter-${chapter}`}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 44,
          px: 1.5,
          mb: 0.5,
          borderRadius: "0.9rem",
          border: `1px solid ${EMBER}42`,
          background: `${EMBER}14`,
          color: EMBER,
          fontSize: "0.85rem",
          transition: "background 200ms ease-out",
          "&:hover": { background: `${EMBER}22` },
        }}
      >
        <Dumbbell size={15} aria-hidden />
        Train this chapter — {count} {count === 1 ? "position" : "positions"}
      </Box>
    </Link>
  );
}
