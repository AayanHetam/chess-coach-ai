// The course hub: everything about one opening hangs off this screen.
//
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-RENDERED, AND THAT IS THE GATE
//
// The page this replaces fetched the course in the browser and sent the band it
// had computed there. The API is not fooled by that — it resolves a signed-in
// caller's band from the cookie and ignores the parameter — but the page still
// rendered a spinner first and its numbers still arrived a beat late. Rendering
// on the server puts the band beside the content that it cut, and a chapter
// this player is not deep enough for is not in the payload at all.
//
// WHAT IS ON IT IS MEASURED. There is no prose about the opening because we
// have none that is ours to write: chapters, shares and decision counts come
// from the corpus, the depth from the band, and the verdict is arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Dumbbell, Search } from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import ChapterRow, { MiniBar, Pill } from "@/components/courses/ChapterRow";
import { CourseExplorer } from "@/components/courses/CourseExplorer";
import { useAuth } from "@/contexts/AuthContext";
import { numbered } from "@/lib/courses/lines";
import { hubFor, type CourseHub } from "@/lib/courses/hub";
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor } from "@/lib/repertoire/levels";
import { trapsForCourse, type CourseTraps } from "@/lib/book/traps";
import TrapsSection from "@/components/courses/TrapsSection";
import { isCourseId } from "@/lib/learn/courseRoute";
import { chapterReaderHref, drillHref } from "@/lib/learn/courseHubRoute";
import { courseTrainerHref } from "@/lib/learn/courseRoute";
import {
  nextChapter,
  readCourseMastery,
  type CourseMastery,
} from "@/lib/learn/courseMastery";

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface Props {
  courseId: string;
  hub: CourseHub;
  /** Null when this band has no trap file — NOT the same as finding none. */
  traps: CourseTraps | null;
  band: string;
}

export default function CourseHubPage({ courseId, hub, traps, band }: Props) {
  const { user } = useAuth();
  const account = user?.uid ?? "";
  const [mastery, setMastery] = useState<CourseMastery | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [exploring, setExploring] = useState(false);

  // `asked`, not `decisions`: see CourseHub.asked. A bar against a number no
  // session can reach is a bar that never fills.
  const chapters = useMemo(
    () => hub.chapters.map(c => ({ i: c.i, asked: c.asked })),
    [hub.chapters]
  );

  // Local first. The screen knows what you know before any network, and a
  // signed-out reader sees the course with no progress rather than no course.
  useEffect(() => {
    // The clock is read HERE and passed in, so the reader stays a pure function
    // of its inputs and nothing renders a different answer on the server than
    // it does in the browser.
    setMastery(readCourseMastery(account, courseId, chapters, Date.now()));
  }, [account, courseId, chapters]);

  const next = mastery ? nextChapter(chapters, mastery) : (chapters.find(c => c.asked > 0)?.i ?? null);
  const done = mastery !== null && next === null && hub.asked > 0;

  const toggle = useCallback((i: number) => setOpen(prev => (prev === i ? null : i)), []);

  return (
    <>
      <Head>
        <title key="title">{`${hub.meta.name} — Chess Masti`}</title>
        {/* The cut depends on the account. Nothing here belongs in a shared cache. */}
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />

      <Box sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
        <Box
          component={Link}
          href="/courses"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            minHeight: 44,
            mb: 1,
            color: "rgba(255,255,255,0.55)",
            fontSize: "0.85rem",
            textDecoration: "none",
            "&:hover": { color: "#fff" },
          }}
          data-testid="hub-back"
        >
          <ArrowLeft size={15} aria-hidden /> All courses
        </Box>

        {/* ── The course ─────────────────────────────────────────────────── */}
        <Box sx={{ display: "flex", gap: { xs: 2, md: 2.5 }, alignItems: "flex-start" }}>
          <Box sx={{ flexShrink: 0 }}>
            <OpeningDiagram moves={hub.meta.root} side={hub.meta.side} px={104} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{
                color: "#fff",
                fontSize: { xs: "1.5rem", md: "2rem" },
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              {hub.meta.name}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: "0.85rem", color: EMBER, mt: 0.5 }}>
              {numbered(hub.meta.root)} · you play {hub.meta.side}
            </Typography>
            <Typography
              data-testid="hub-verdict"
              sx={{
                color: "rgba(255,255,255,0.58)",
                fontSize: "0.9rem",
                mt: 1,
                lineHeight: 1.6,
                maxWidth: "56ch",
              }}
            >
              {hub.verdict}
            </Typography>
          </Box>
        </Box>

        {/* ── Progress ───────────────────────────────────────────────────── */}
        <Box
          data-testid="course-progress"
          sx={{
            mt: 3,
            p: { xs: 2, md: 2.5 },
            borderRadius: "1.5rem",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(12px)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 2,
              mb: 1.25,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Course progress
            </Typography>
            <Typography
              data-testid="progress-count"
              sx={{
                fontSize: "0.82rem",
                color: "rgba(255,255,255,0.7)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {mastery?.known ?? 0} of {hub.asked} decisions
            </Typography>
          </Box>
          <Box sx={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
            <Box
              component={motion.div}
              initial={{ width: 0 }}
              animate={{
                width: `${hub.asked > 0 ? Math.round(((mastery?.known ?? 0) / hub.asked) * 100) : 0}%`,
              }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              sx={{ height: "100%", background: EMBER, boxShadow: `0 0 14px ${EMBER}66` }}
            />
          </Box>

          {/*
            KNOWN and ANSWERED are two numbers and they are never merged. A
            player with every chapter opened and nothing owned would otherwise
            read as finished.
          */}
          <Typography sx={{ mt: 1.25, fontSize: "0.76rem", color: "rgba(255,255,255,0.42)" }}>
            {done
              ? "You know every decision in this course at your level."
              : `${mastery?.learning ?? 0} still learning · ${
                  hub.asked - (mastery?.known ?? 0) - (mastery?.learning ?? 0)
                } not asked yet`}
          </Typography>

          {/*
            Cards are EARNED. A course nobody has got wrong owes nothing and
            says nothing here, and that silence is the claim: enrolling in a
            185-line course creates zero reviews.
          */}
          {mastery !== null && mastery.due > 0 && (
            <Typography
              data-testid="course-due"
              sx={{ mt: 0.5, fontSize: "0.8rem", color: EMBER }}
            >
              {mastery.due} due back — decisions you have missed before.
            </Typography>
          )}

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
            {next !== null && (
              <Link
                href={chapterReaderHref(courseId, next)}
                style={{ textDecoration: "none" }}
                data-testid="hub-continue"
              >
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1.25,
                    minHeight: 48,
                    px: 2.5,
                    borderRadius: "1.25rem",
                    border: `1px solid ${EMBER}42`,
                    background: `${EMBER}14`,
                    color: EMBER,
                    fontSize: "0.95rem",
                    transition: "background 200ms ease-out",
                    "&:hover": { background: `${EMBER}22` },
                  }}
                >
                  {mastery && mastery.started > 0 ? "Continue" : "Start learning"}
                  <ArrowRight size={17} aria-hidden />
                </Box>
              </Link>
            )}
            {next !== null && (
              <Pill href={courseTrainerHref(courseId, next)} testid="hub-train">
                Train chapter {next + 1}
              </Pill>
            )}
            <Pill href={drillHref(courseId)} icon={<Dumbbell size={14} aria-hidden />} testid="hub-drill">
              Drill
            </Pill>
            <Box
              component="button"
              onClick={() => setExploring(true)}
              data-testid="hub-explorer"
              sx={{
                appearance: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                minHeight: 40,
                px: 1.75,
                borderRadius: "0.9rem",
                fontSize: "0.85rem",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.78)",
                cursor: "pointer",
                transition: "background 200ms ease-out",
                "&:hover": { background: "rgba(255,255,255,0.08)", color: "#fff" },
                "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
              }}
            >
              <Search size={14} aria-hidden />
              Find a position
            </Box>
          </Box>
        </Box>

        {/* ── The chapters ───────────────────────────────────────────────── */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 280px" }, gap: 2.5, mt: 3 }}>
          <Box sx={{ display: "grid", gap: 1.25, minWidth: 0 }}>
            {hub.chapters.map((unit, i) => (
              <ChapterRow
                key={unit.i}
                courseId={courseId}
                side={hub.meta.side}
                unit={unit}
                mastery={mastery?.byChapter.get(unit.i)}
                open={open === unit.i}
                onToggle={() => toggle(unit.i)}
                index={i}
              />
            ))}
            {hub.omitted.chapters > 0 && (
              <Typography
                data-testid="hub-omitted"
                sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem", px: 1, mt: 0.5 }}
              >
                {hub.omitted.chapters} more {hub.omitted.chapters === 1 ? "chapter is" : "chapters are"}{" "}
                below the depth for your level, together{" "}
                {Math.round(hub.omitted.share * 100)}% of what you meet.
              </Typography>
            )}
          </Box>

          {/* ── The side card ────────────────────────────────────────────── */}
          <Box sx={{ display: "grid", gap: 1.5, alignContent: "start" }}>
            <Box
              sx={{
                p: 2,
                borderRadius: "1.5rem",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
              }}
            >
              <Typography sx={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>
                Drill this opening
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", mt: 0.75, lineHeight: 1.6 }}>
                Any chapter or study, asked cold — whether or not you owe it. Nothing here is
                unlocked by anything else.
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <Pill href={drillHref(courseId)} icon={<Dumbbell size={14} aria-hidden />} ember testid="side-drill">
                  Choose what to drill
                </Pill>
              </Box>
            </Box>

            <Box
              sx={{
                p: 2,
                borderRadius: "1.5rem",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <Typography sx={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
                At your level
              </Typography>
              <Box sx={{ display: "grid", gap: 0.75, mt: 1 }}>
                <Fact label="Level" value={hub.bandName} />
                <Fact label="Depth" value={`${hub.theoryPlies} plies of this opening`} />
                <Fact label="Chapters" value={String(hub.chapters.length)} />
                {/* Both numbers when they differ, because they mean different
                    things: the course's size, and what a session can reach. */}
                <Fact
                  label="Decisions"
                  value={
                    hub.asked === hub.decisions
                      ? String(hub.decisions)
                      : `${hub.asked} of ${hub.decisions}`
                  }
                />
              </Box>
              <Box sx={{ mt: 1.5 }}>
                <MiniBar known={mastery?.known ?? 0} total={hub.asked} />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* How this opening actually goes wrong for people at this rating.
            Server-rendered with the band already resolved, so the numbers and
            the sentence above them can never disagree about whose games they
            are. Renders nothing at all when there is no file for the band —
            "we did not look" must not read as "there is nothing to fall for". */}
        <TrapsSection traps={traps} band={band} side={hub.meta.side} />

        {/* Provenance. Every claim on this page is checkable. */}
        <Typography sx={{ mt: 4, fontSize: "0.73rem", color: "rgba(255,255,255,0.33)", lineHeight: 1.7, maxWidth: "76ch" }}>
          Your moves are chosen by the engine and checked against{" "}
          {hub.meta.corpus.games.toLocaleString()} games ({hub.meta.corpus.source}); their replies
          are what people actually play. Evaluations from {hub.meta.evals.source} (
          {hub.meta.evals.licence}), covering{" "}
          {Math.round((hub.meta.evals.covered / Math.max(1, hub.meta.evals.of)) * 100)}% of this
          course.
        </Typography>
      </Box>

      {exploring && (
        <CourseExplorer
          courseId={courseId}
          courseName={hub.meta.name}
          onClose={() => setExploring(false)}
        />
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: "baseline" }}>
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem" }}>{label}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.82)", fontSize: "0.82rem", textAlign: "right" }}>
        {value}
      </Typography>
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ctx => {
  const raw = Array.isArray(ctx.params?.courseId) ? ctx.params?.courseId[0] : ctx.params?.courseId;
  if (!isCourseId(raw)) return { notFound: true };

  // The band comes from the account, never from the request — the same rule the
  // trainer states and for the same reason. A failed profile read degrades to
  // "we do not know you", which is the middle band.
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

  const band = bandFor(rating);
  const hub = hubFor(raw, band);
  if (!hub) return { notFound: true };

  // Resolved here, from the same band the course was cut to. Fetching this in
  // the browser would let the heading ("at your level") render before the
  // numbers underneath it knew which level that was.
  const traps = trapsForCourse(band.id, hub.meta.root, hub.meta.side);

  ctx.res.setHeader("Cache-Control", "private, no-store");
  return { props: { courseId: raw, hub, traps, band: band.id } };
};
