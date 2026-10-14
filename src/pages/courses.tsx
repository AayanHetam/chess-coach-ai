"use client";

// /courses — the whole library, on shelves.
//
// ─────────────────────────────────────────────────────────────────────────────
// /learn answers "what should my repertoire BE". This answers "what can I go
// and learn", which is a different question with a different shape: browsing,
// not deciding. So it is shelves and a search box rather than a bracket, and
// nothing on it is a commitment — every card is a way in, not a choice.
//
// It replaces a legacy CourseLibrary that read from an unrelated /api/courses
// and had no link pointing at it from anywhere in the product. The 43 real
// generated courses were reachable only from a chip on a filled /learn slot,
// which meant a player had to finish deciding before they could see what there
// was to learn.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NavPill } from "@/components/ui/NavPill";
import { Masti, type MastiMood } from "@/components/masti";
import CourseCard from "@/components/courses/CourseCard";
import CourseShelf from "@/components/courses/CourseShelf";
import { loadCourseIndex } from "@/lib/courses/load";
import { loadRepertoireMap } from "@/lib/repertoire/load";
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor } from "@/lib/repertoire/levels";
import { loadBracket } from "@/lib/repertoire/store";
import { readCourseProgress } from "@/lib/learn/courseProgress";
import {
  FILTERS,
  catalogue,
  matches,
  passesFilter,
  shelves,
  type CatalogueEntry,
  type CourseProgress,
  type FilterId,
} from "@/lib/courses/catalogue";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface Props {
  entries: CatalogueEntry[];
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const index = loadCourseIndex();

  // The band comes from the account, never from the request — the same rule
  // /learn/[courseId] states and for the same reason. A failed profile read
  // degrades to "we do not know you", which is the middle band.
  //
  // It matters here because the "Answers the most on its own" shelf is RANKED
  // by slot share × absorbs and its note says "share of your games". Read off
  // the Elite map that sentence describes 2300s: the Caro-Kann absorbs 100% of
  // play at 2300+ and 70% under 800, and 1.e4 is 47% of Elite Black games
  // against 62% of improving ones. Two screens making the same claim off two
  // corpora is the exact failure this programme exists to remove.
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
  const map = loadRepertoireMap(bandFor(rating).id);
  if (!index) {
    // No generated courses is a build without the artifacts, not an error the
    // visitor caused. An empty catalogue renders its own explanation.
    ctx.res.setHeader("Cache-Control", "private, no-store");
    return { props: { entries: [] } };
  }
  // Course ids ARE choice ids — verified against the shipped data, all 43 of
  // them — which is what lets an authored blurb reach a generated course
  // without either side knowing about the other.
  const meta = new Map<
    string,
    {
      blurb: string;
      coverage: CatalogueEntry["coverage"];
      diagram: string[];
      absorbs: number;
      slotShare: number;
    }
  >();
  for (const slot of map?.slots ?? []) {
    for (const choice of slot.choices) {
      meta.set(choice.id, {
        blurb: choice.blurb,
        coverage: choice.coverage,
        diagram: choice.diagram,
        absorbs: choice.absorbs,
        slotShare: slot.share,
      });
    }
  }
  // The ranking now depends on the account's band, so this response is
  // per-user and must not sit in a shared cache. Same header, same reason, as
  // /learn/[courseId].
  ctx.res.setHeader("Cache-Control", "private, no-store");
  return { props: { entries: catalogue(index.courses, meta) } };
};

export default function CoursesPage({ entries }: Props) {
  const { user } = useAuth();
  const account = user?.uid ?? "guest";

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [progress, setProgress] = useState<ReadonlyMap<string, CourseProgress>>(
    new Map()
  );
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());

  // Both are localStorage, so both are read in an effect. Reading during render
  // would make the server and the client disagree and hydrate into a different
  // catalogue.
  useEffect(() => {
    // The clock is read HERE and passed in, so the reader stays a pure
    // function of its inputs and the server never renders a different answer
    // from the browser.
    setProgress(readCourseProgress(account, Date.now()));
    const bracket = loadBracket(account);
    setMine(
      new Set(
        [...bracket.white, ...bracket.black]
          .map((p) => p.choiceId)
          .filter((id): id is string => Boolean(id))
      )
    );
  }, [account]);

  const visible = useMemo(
    () =>
      entries.filter((e) => passesFilter(e, filter, mine) && matches(e, query)),
    [entries, filter, mine, query]
  );

  // Searching is a request for a flat answer, not a browse. Shelves would put
  // one hit under "White openings" and another under "Answers the most",
  // and the reader has to scan four rails to find two courses.
  const searching = query.trim().length > 0;
  const rails = useMemo(
    () => (searching ? [] : shelves(visible, { progress, mine })),
    [searching, visible, progress, mine]
  );

  return (
    <>
      <Head>
        <title key="title">Opening courses · Chess Masti AI</title>
        <meta
          key="description"
          name="description"
          content="Every opening course, with the lines derived from 3.4 million games and the position each one produces."
        />
      </Head>
      <Box sx={{ minHeight: "100dvh", px: { xs: 2, md: 3 }, pt: 2, pb: 6 }}>
        <NavPill />
        <Box
          sx={{
            maxWidth: 1240,
            mx: "auto",
            mt: 3,
            // The reference sits its whole catalogue on one raised panel, which
            // is what separates "a page with rows on it" from "a library". The
            // rails scroll inside it, so the panel also gives them an edge to
            // run to instead of bleeding off the viewport. One flat card.
            position: "relative",
            overflow: "hidden",
            borderRadius: `${RADIUS.card}px`,
            border: `1px solid ${LINE.hairline}`,
            background: SURFACE.raised,
            px: { xs: 2, md: 3.5 },
            py: { xs: 2.5, md: 3.5 },
          }}
        >
          <Typography
            component="h1"
            sx={{
              ...TYPE.h1,
              fontSize: { xs: "1.75rem", md: TYPE.h1.fontSize },
              color: TEXT.primary,
              mb: 0.75,
            }}
          >
            Courses
          </Typography>
          <Typography
            sx={{
              ...TYPE.body,
              color: TEXT.secondary,
              mb: 3,
              maxWidth: "65ch",
            }}
          >
            {entries.length} opening courses, every line built from real games
            rather than written by hand. Pick one and work through it a chapter
            at a time.
          </Typography>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flex: "1 1 260px",
                maxWidth: 380,
                px: 1.5,
                py: 0.25,
                borderRadius: `${RADIUS.control}px`,
                border: `1px solid ${LINE.hairline}`,
                background: "rgba(255,255,255,0.06)",
                transition: `border-color ${MOTION.hover}`,
                "&:hover": { borderColor: LINE.strong },
                // The field's focus ring, as the theme's inputs draw it.
                "&:focus-within": { borderColor: ACCENT.main },
              }}
            >
              <Search
                size={16}
                color={TEXT.secondary}
                strokeWidth={1.75}
                aria-hidden
              />
              <Box
                component="input"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setQuery(e.target.value)
                }
                placeholder="Search courses"
                aria-label="Search courses"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  background: "none",
                  border: "none",
                  color: TEXT.primary,
                  fontSize: TYPE.bodySmall.fontSize,
                  outline: "none",
                  "&::placeholder": { color: TEXT.tertiary },
                }}
              />
            </Box>
            {filter !== "all" && (
              <Box
                component="button"
                onClick={() => setFilter("all")}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,
                  minHeight: 44,
                  px: 2,
                  borderRadius: `${RADIUS.pill}px`,
                  cursor: "pointer",
                  border: `1px solid ${LINE.strong}`,
                  background: "transparent",
                  color: TEXT.primary,
                  fontSize: TYPE.bodySmall.fontSize,
                  fontWeight: 600,
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
                  "&:hover": {
                    background: "rgba(255,255,255,0.06)",
                    borderColor: TEXT.secondary,
                  },
                  "&:active": { transform: MOTION.pressScale },
                  "&:focus-visible": {
                    outline: `2px solid ${TEXT.primary}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <ArrowLeft size={14} aria-hidden /> All courses
              </Box>
            )}
          </Box>

          <Box
            role="tablist"
            aria-label="Filter courses"
            sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3.5 }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <Box
                  key={f.id}
                  component="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  sx={{
                    // A pressable filter chip: the selected one is the lighter
                    // step with weight 600, the rest are hairline pills.
                    minHeight: 40,
                    px: 2,
                    borderRadius: `${RADIUS.pill}px`,
                    cursor: "pointer",
                    border: `1px solid ${active ? LINE.strong : LINE.hairline}`,
                    background: active
                      ? "rgba(255,255,255,0.10)"
                      : "transparent",
                    color: active ? TEXT.primary : TEXT.secondary,
                    fontSize: TYPE.bodySmall.fontSize,
                    fontWeight: active ? 600 : 500,
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    transition: `background-color ${MOTION.hover}, color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
                    "&:hover": active
                      ? {}
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: TEXT.primary,
                        },
                    "&:active": { transform: MOTION.pressScale },
                    "&:focus-visible": {
                      outline: `2px solid ${TEXT.primary}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  {f.label}
                </Box>
              );
            })}
          </Box>

          {entries.length === 0 ? (
            <Empty
              mood="defeated"
              title="No courses are built into this deployment"
              body="The generated course files are missing. Nothing is broken on your side."
            />
          ) : visible.length === 0 ? (
            <Empty
              mood={searching ? "nervous" : "wave"}
              title={
                searching
                  ? `Nothing matches “${query.trim()}”`
                  : "Nothing here yet"
              }
              body={
                filter === "mine"
                  ? "Choose some openings on Learn and the courses behind them appear here."
                  : "Try a different search, or clear the filter."
              }
            />
          ) : searching ? (
            <SearchResults entries={visible} progress={progress} />
          ) : (
            rails.map((shelf) => (
              <CourseShelf key={shelf.key} shelf={shelf} progress={progress} />
            ))
          )}
        </Box>
      </Box>
    </>
  );
}

/**
 * A flat wrapping grid, because a search is a request for an answer.
 *
 * Not a rail: a horizontal scroller hides results off the right edge, which is
 * exactly the wrong shape for "did you find it?" — the reader wants to see how
 * many there are and all of them at once.
 */
function SearchResults({
  entries,
  progress,
}: {
  entries: CatalogueEntry[];
  progress: ReadonlyMap<string, CourseProgress>;
}) {
  return (
    <>
      <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mb: 1.5 }}>
        {entries.length} {entries.length === 1 ? "course" : "courses"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
        {entries.map((entry) => (
          <CourseCard
            key={entry.id}
            entry={entry}
            progress={progress.get(entry.id)}
          />
        ))}
      </Box>
    </>
  );
}

function Empty({
  title,
  body,
  mood,
}: {
  title: string;
  body: string;
  mood?: MastiMood;
}) {
  return (
    <Box sx={{ py: 8, maxWidth: 520 }}>
      {mood && (
        <Masti
          mood={mood}
          size={110}
          loops={2}
          decorative
          style={{ marginBottom: 12 }}
        />
      )}
      <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 0.75 }}>
        {title}
      </Typography>
      <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
        {body}
      </Typography>
    </Box>
  );
}
