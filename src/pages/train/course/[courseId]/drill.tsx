// DRILL: pick anything in the course and be asked it cold.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A SEPARATE ENTRANCE AND NOT A BUTTON ON THE TRAINER
//
// The trainer asks what you owe: it consults your records, skips what you own,
// and gets shorter as you learn. That is the product's whole argument and it is
// the wrong tool the week before a tournament, when the question is not "what
// have I not learned" but "is the Alapin still in there".
//
// So a drill ignores records entirely — same board, same grading, same
// re-queue on a miss, a queue that was not chosen from what you know. Nothing
// here is unlocked by anything else, which is the other half of it: a player
// may drill chapter 9 having never opened chapter 1.
// ─────────────────────────────────────────────────────────────────────────────

import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { Box, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { numbered } from "@/lib/courses/lines";
import { getSessionFromCookieHeader } from "@/lib/auth/sessionToken";
import { getUserById } from "@/lib/server/users";
import { resolveUserRating } from "@/lib/coach/userRating";
import { bandFor } from "@/lib/repertoire/levels";
import { hubFor, type ChapterUnit } from "@/lib/courses/hub";
import { drillRounds, ROUND_SIZE } from "@/lib/learn/chapterRound";
import { isCourseId } from "@/lib/learn/courseRoute";
import { drillHref } from "@/lib/learn/courseHubRoute";

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface Props {
  courseId: string;
  courseName: string;
  side: "white" | "black";
  root: string[];
  chapters: ChapterUnit[];
  asked: number;
}

export default function DrillPickerPage(props: Props) {
  return (
    <>
      <Head>
        <title key="title">{`Drill ${props.courseName} — Chess Masti`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <GradientBackdrop />

      <Box sx={{ maxWidth: 760, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
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
          data-testid="drill-back"
        >
          <ChevronLeft size={16} aria-hidden /> {props.courseName}
        </Box>

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1 }}>
          <OpeningDiagram moves={props.root} side={props.side} px={72} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{ color: "#fff", fontSize: { xs: "1.35rem", md: "1.7rem" }, fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              Drill
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.88rem", mt: 0.4, lineHeight: 1.6 }}>
              Pick anything and be asked it cold, whether or not you owe it. Nothing here is
              unlocked by anything else.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gap: 1.25, mt: 3 }}>
          {props.chapters.map((unit, i) => (
            <Box
              key={unit.i}
              data-testid={`drill-chapter-${unit.i}`}
              sx={{
                borderRadius: "1.5rem",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
                overflow: "hidden",
              }}
            >
              <Row
                href={drillHref(props.courseId, unit.i)}
                title={unit.title ?? numbered(unit.line)}
                over={`Chapter ${i + 1}`}
                under={sizeWords(unit.asked)}
                mono
                testid={`drill-go-${unit.i}`}
              />
              {unit.studies.length > 0 && (
                <Box sx={{ px: 1, pb: 1, display: "grid", gap: 0.25 }}>
                  {unit.studies
                    .filter(study => study.asked > 0)
                    .map(study => (
                    <Row
                      key={study.id}
                      href={drillHref(props.courseId, unit.i, study.id)}
                      title={study.title}
                      under={sizeWords(study.asked)}
                      inset
                        testid={`drill-go-${unit.i}-${study.id}`}
                      />
                    ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        {props.asked === 0 && (
          <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.88rem", mt: 3 }}>
            There is nothing to drill in this course at your level yet.
          </Typography>
        )}
      </Box>
    </>
  );
}

/**
 * The size of a drill, in the units it is actually taken in.
 *
 * Rounds and not just a count, because a round is what a player commits to and
 * "47 decisions" hides that it is ten of them.
 */
function sizeWords(count: number): string {
  const rounds = drillRounds(count);
  if (count === 0) return "nothing to ask here";
  return `${count} ${count === 1 ? "decision" : "decisions"} · ${rounds} ${
    rounds === 1 ? "round" : "rounds"
  } of ${ROUND_SIZE}`;
}

function Row({
  href,
  title,
  over,
  under,
  mono,
  inset,
  testid,
}: {
  href: string;
  title: string;
  over?: string;
  under: string;
  mono?: boolean;
  inset?: boolean;
  testid: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }} data-testid={testid}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minHeight: inset ? 52 : 64,
          px: inset ? 1.5 : 2,
          py: 1,
          ml: inset ? 1 : 0,
          borderRadius: inset ? "0.9rem" : 0,
          background: inset ? "rgba(0,0,0,0.22)" : "transparent",
          border: inset ? "1px solid rgba(255,255,255,0.06)" : "none",
          transition: "background 200ms ease-out",
          "&:hover": { background: inset ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.05)" },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {over && (
            <Typography
              sx={{
                color: "rgba(255,255,255,0.35)",
                fontSize: "0.66rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {over}
            </Typography>
          )}
          <Typography
            sx={{
              color: "#fff",
              fontSize: inset ? "0.82rem" : "0.9rem",
              fontFamily: mono ? MONO : undefined,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.74rem", mt: 0.2 }}>
            {under}
          </Typography>
        </Box>
        <ChevronRight size={16} color={EMBER} aria-hidden />
      </Box>
    </Link>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ctx => {
  const raw = Array.isArray(ctx.params?.courseId) ? ctx.params?.courseId[0] : ctx.params?.courseId;
  if (!isCourseId(raw)) return { notFound: true };

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

  const hub = hubFor(raw, bandFor(rating));
  if (!hub) return { notFound: true };

  ctx.res.setHeader("Cache-Control", "private, no-store");
  return {
    props: {
      courseId: raw,
      courseName: hub.meta.name,
      side: hub.meta.side,
      root: hub.meta.root,
      // A chapter that asks nothing is not something to pick.
      chapters: hub.chapters.filter(c => c.asked > 0),
      asked: hub.asked,
    },
  };
};
