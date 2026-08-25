// The course trainer: one chapter, asked.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BAND IS RESOLVED HERE AND THE URL CANNOT ARGUE
//
// `/api/opening-courses/[id]` says in its own header that its `band` parameter
// is a size boundary and not a security one, and the reader at
// /learn/[courseId] computes the band in the browser and sends it. This route
// takes neither: it reads the session cookie, resolves the rating from the
// account, and cuts the course before anything is serialised. `?band=` on this
// URL does nothing at all, and the assertion that proves it compares the two
// __NEXT_DATA__ payloads byte for byte.
//
// THIS FILE RENDERS THE CONTRACT SCREEN ONLY. The probe loop, the teach card
// and the summaries land on top of it. A half-built trainer is worse than none,
// so the screen it ships with is a complete one: what this chapter is, how much
// of it you already know, and one button.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
// From sessionToken, not session: the latter imports `next/headers`, which is
// App-Router-only and fails the build when a pages/ page pulls it in. API
// routes under pages/api survive that import and a page does not.
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor, type BandId } from "@/lib/repertoire/levels";
import { loadCourse } from "@/lib/courses/load";
import { viewFor } from "@/lib/courses/view";
import { probesOf, type CourseProbe } from "@/lib/courses/probes";
import { numbered } from "@/lib/courses/lines";
import { chapterParam, courseReaderHref, courseTrainerHref } from "@/lib/learn/courseRoute";
import { loadChapter } from "@/lib/learn/chapterProgress";
import { pullChapter } from "@/lib/learn/chapterSync";
import { ROUND_SIZE, SITTING_ROUNDS, roundTally, type Records } from "@/lib/learn/chapterRound";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  courseId: string;
  courseName: string;
  side: "white" | "black";
  chapter: number;
  chapterLine: string[];
  chapterShare: number;
  band: BandId;
  bandName: string;
  theoryPlies: number;
  corpusSource: string;
  corpusGames: number;
  probes: CourseProbe[];
  total: number;
  capped: boolean;
}

export default function CourseTrainerPage(props: Props) {
  const { user } = useAuth();
  // The uid, not a linked platform handle. Mastery syncs to the account, so the
  // local copy has to be keyed by the same thing the server keys by, or a
  // player who links a chess.com account mid-way would appear to lose a month.
  const account = user?.uid ?? "";
  const [records, setRecords] = useState<Records>({});

  // Local first, always. The screen knows what you know before any network.
  useEffect(() => {
    if (!account) return;
    setRecords(loadChapter(account, props.courseId, props.chapter));
  }, [account, props.courseId, props.chapter]);

  // The account copy arrives when it arrives.
  useEffect(() => {
    if (!account) return;
    let live = true;
    pullChapter({ account, courseId: props.courseId, chapter: props.chapter }).then((merged) => {
      if (live && merged) setRecords(merged);
    });
    return () => {
      live = false;
    };
  }, [account, props.courseId, props.chapter]);

  const tally = useMemo(() => roundTally(props.probes, records), [props.probes, records]);

  return (
    <>
      <Head>
        <title key="title">{`Train ${props.courseName} — Chess Masti AI`}</title>
        {/* Progress is per account; nothing here belongs in a shared cache. */}
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />
      <Box
        sx={{
          minHeight: "100dvh",
          px: { xs: 2, md: 4 },
          py: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 720 }}>
          <Link
            href={courseReaderHref(props.courseId)}
            style={{
              // On the ANCHOR, not on the text inside it: an <a> is inline by
              // default, so its box is the line box and a minHeight on a child
              // leaves the tappable area at 19px. Measured, not assumed.
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              minHeight: 44,
              paddingRight: "0.5rem",
              textDecoration: "none",
              color: "rgba(255,255,255,0.62)",
              fontSize: "0.85rem",
            }}
            data-testid="course-trainer-back"
          >
            <ChevronLeft size={16} aria-hidden />
            The course
          </Link>

          <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1 }}>
            <OpeningDiagram moves={props.chapterLine} side={props.side} px={104} />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: { xs: "0.95rem", md: "1.05rem" },
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                {numbered(props.chapterLine)}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.58)", fontSize: "0.85rem", mt: 0.5 }}>
                {Math.round(props.chapterShare * 100)}% of what you meet here
              </Typography>
            </Box>
          </Box>

          <Typography
            component="h1"
            sx={{
              mt: 4,
              fontSize: { xs: "1.1rem", md: "1.25rem" },
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.92)",
            }}
          >
            Before we teach anything, we ask.
          </Typography>

          <Box
            component="dl"
            data-testid="course-buckets"
            sx={{
              mt: 3,
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr 1fr" },
              gap: 1.5,
              m: 0,
            }}
          >
            <Bucket label="Not asked yet" value={tally.unseen} testid="bucket-unseen" />
            <Bucket label="Still learning" value={tally.learning} testid="bucket-learning" />
            <Bucket label="Known" value={tally.known} testid="bucket-known" />
          </Box>

          {props.capped && (
            <Typography
              data-testid="course-capped"
              sx={{ mt: 2, color: "rgba(255,255,255,0.58)", fontSize: "0.85rem" }}
            >
              Showing the {props.probes.length} most likely of {props.total} positions in this
              chapter.
            </Typography>
          )}

          <Box sx={{ mt: 4, display: "grid", gap: 1 }}>
            <Fact label="This sitting" value={`${SITTING_ROUNDS} rounds · ${ROUND_SIZE} positions a round`} />
            <Fact label="Shown to" value={`${props.theoryPlies} plies, the depth for your level`} />
            <Fact label="Your level" value={props.bandName} />
            {/*
              The corpus, named. NOT the band: "Frequencies from Improving"
              reads as "these are the moves players at your level make", and
              they are not — every share in the product comes from Lichess
              Elite. Putting the band on that row asserted precisely the thing
              the rating-banded corpus has not been built yet to make true.
            */}
            <Fact
              label="Frequencies from"
              value={`${(props.corpusGames / 1e6).toFixed(1)}M games · ${props.corpusSource.split(",")[0]}`}
            />
          </Box>

          <Box sx={{ mt: 4 }}>
            <Link
              href={courseTrainerHref(props.courseId, props.chapter, 1)}
              style={{ textDecoration: "none", display: "inline-block" }}
              data-testid="course-start"
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  minHeight: 52,
                  px: 3,
                  borderRadius: "1.5rem",
                  border: "1px solid rgba(251,146,60,0.42)",
                  background: "rgba(251,146,60,0.10)",
                  color: "#FB923C",
                  fontSize: "0.98rem",
                  transition: "background 200ms ease-out",
                  "&:hover": { background: "rgba(251,146,60,0.16)" },
                }}
              >
                Start round 1
                <ArrowRight size={18} aria-hidden />
              </Box>
            </Link>
          </Box>
        </Box>
      </Box>
    </>
  );
}

function Bucket({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <Box
      sx={{
        borderRadius: "1.5rem",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        px: 2,
        py: 1.75,
      }}
    >
      <Box component="dt" sx={{ color: "rgba(255,255,255,0.52)", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </Box>
      <Box
        component="dd"
        data-testid={testid}
        sx={{ m: 0, mt: 0.5, fontSize: "1.6rem", color: "rgba(255,255,255,0.92)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Box>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: "grid",
        // Stacked at 375 and aligned above it. A flex row with a minWidth label
        // wraps its VALUE onto a line of its own, which reads as a broken pair
        // rather than as a wrap — measured on the phone, not reasoned about.
        gridTemplateColumns: { xs: "1fr", sm: "132px 1fr" },
        columnGap: 2,
        rowGap: 0.25,
        alignItems: "baseline",
      }}
    >
      <Typography sx={{ color: "rgba(255,255,255,0.48)", fontSize: "0.8rem" }}>{label}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.78)", fontSize: "0.88rem" }}>{value}</Typography>
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const courseId = Array.isArray(ctx.params?.courseId) ? ctx.params?.courseId[0] : ctx.params?.courseId;
  const chapter = chapterParam(ctx.params?.chapter);
  if (chapter === null) return { notFound: true };

  // `loadCourse` is the guard, not a shape check: it validates the id against
  // the catalogue and never builds a path for one that is not in it. A regex in
  // front of it looked like defence and was measurably nothing — deleting it
  // left every test green, because an id that fails the shape also fails the
  // catalogue.
  const course = courseId ? loadCourse(courseId) : null;
  if (!course || !courseId) return { notFound: true };

  // The band comes from the account, never from the request. A failed profile
  // read degrades to "we do not know you", which is the middle band — being
  // wrong downward costs a strong player depth for one session, and being wrong
  // upward hands a beginner theory the whole cut exists to keep from them.
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

  const view = viewFor(course, band);
  const chapterView = view.chapters.find((c) => c.i === chapter);
  if (!chapterView) return { notFound: true };

  const { probes, total, capped } = probesOf(view, chapter, course.meta.side);

  // Progress is per account and this page carries a band chosen from it.
  ctx.res.setHeader("Cache-Control", "private, no-store");

  return {
    props: {
      courseId,
      courseName: course.meta.name,
      side: course.meta.side,
      chapter,
      chapterLine: chapterView.line,
      chapterShare: chapterView.share,
      band: band.id,
      bandName: band.name,
      theoryPlies: view.theoryPlies,
      corpusSource: course.meta.corpus.source,
      corpusGames: course.meta.corpus.games,
      probes,
      total,
      capped,
    },
  };
};
