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
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
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

const EMBER = "#FB923C";

interface Props {
  entries: CatalogueEntry[];
}

export const getServerSideProps: GetServerSideProps<Props> = async ctx => {
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
    { blurb: string; coverage: CatalogueEntry["coverage"]; diagram: string[]; absorbs: number; slotShare: number }
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
  const [progress, setProgress] = useState<ReadonlyMap<string, CourseProgress>>(new Map());
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
    () => entries.filter((e) => passesFilter(e, filter, mine) && matches(e, query)),
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
        <title key="title">Opening courses — Chess Masti AI</title>
        <meta
          key="description"
          name="description"
          content="Every opening course, with the lines derived from 3.4 million games and the position each one produces."
        />
      </Head>
      <GradientBackdrop />
      <Box sx={{ minHeight: "100dvh", px: { xs: 2, md: 3 }, pt: 2, pb: 6 }}>
        <NavPill />
        <Box
          sx={{
            maxWidth: 1240, mx: "auto", mt: 3,
            // The reference sits its whole catalogue on one raised panel, which
            // is what separates "a page with rows on it" from "a library". The
            // rails scroll inside it, so the panel also gives them an edge to
            // run to instead of bleeding off the viewport.
            borderRadius: "1.5rem",
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.022)",
            backdropFilter: "blur(12px)",
            px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 3.5 },
          }}
        >
          <Typography component="h1" sx={{ color: "#fff", fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 800, letterSpacing: "-0.02em", mb: 0.75 }}>
            Courses
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.95rem", lineHeight: 1.6, mb: 3, maxWidth: 640 }}>
            {entries.length} opening courses, every line derived from the corpus rather than
            written out. Pick one and work through it a chapter at a time.
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
            <Box
              sx={{
                display: "flex", alignItems: "center", gap: 1, flex: "1 1 260px", maxWidth: 380,
                px: 1.5, py: 0.25, borderRadius: "0.85rem",
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
                "&:focus-within": { borderColor: EMBER },
              }}
            >
              <Search size={15} color="rgba(255,255,255,0.4)" aria-hidden />
              <Box
                component="input"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                placeholder="Search courses"
                aria-label="Search courses"
                sx={{
                  flex: 1, minWidth: 0, minHeight: 44, background: "none", border: "none",
                  color: "#fff", fontSize: "0.88rem", outline: "none",
                  "&::placeholder": { color: "rgba(255,255,255,0.35)" },
                }}
              />
            </Box>
            {filter !== "all" && (
              <Box
                component="button"
                onClick={() => setFilter("all")}
                sx={{
                  display: "inline-flex", alignItems: "center", gap: 0.6, minHeight: 44, px: 1.5,
                  borderRadius: "999px", cursor: "pointer",
                  border: `1px solid ${EMBER}55`, background: `${EMBER}12`, color: EMBER,
                  fontSize: "0.82rem", fontWeight: 600,
                  "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
                }}
              >
                <ArrowLeft size={14} aria-hidden /> All courses
              </Box>
            )}
          </Box>

          <Box role="tablist" aria-label="Filter courses" sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3.5 }}>
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
                    minHeight: 40, px: 1.75, borderRadius: "999px", cursor: "pointer",
                    border: `1px solid ${active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)"}`,
                    background: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.03)",
                    color: active ? "#0B0D12" : "rgba(255,255,255,0.7)",
                    fontSize: "0.82rem", fontWeight: active ? 700 : 500,
                    transition: "background 180ms ease, color 180ms ease, border-color 180ms ease",
                    "&:hover": active ? {} : { borderColor: "rgba(255,255,255,0.28)", color: "#fff" },
                    "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
                  }}
                >
                  {f.label}
                </Box>
              );
            })}
          </Box>

          {entries.length === 0 ? (
            <Empty
              title="No courses are built into this deployment"
              body="The generated course files are missing. Nothing is broken on your side."
            />
          ) : visible.length === 0 ? (
            <Empty
              title={searching ? `Nothing matches “${query.trim()}”` : "Nothing here yet"}
              body={
                filter === "mine"
                  ? "Choose some openings on Learn and the courses behind them appear here."
                  : "Try a different search, or clear the filter."
              }
            />
          ) : searching ? (
            <SearchResults entries={visible} progress={progress} />
          ) : (
            rails.map((shelf) => <CourseShelf key={shelf.key} shelf={shelf} progress={progress} />)
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
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", mb: 1.5 }}>
        {entries.length} {entries.length === 1 ? "course" : "courses"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
        {entries.map((entry) => (
          <CourseCard key={entry.id} entry={entry} progress={progress.get(entry.id)} />
        ))}
      </Box>
    </>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Box sx={{ py: 8, maxWidth: 520 }}>
      <Typography sx={{ color: "#fff", fontSize: "1.05rem", fontWeight: 700, mb: 0.75 }}>{title}</Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem", lineHeight: 1.6 }}>{body}</Typography>
    </Box>
  );
}
