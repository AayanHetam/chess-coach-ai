// One chapter in the course hub, and its studies when it has any.
//
// A ROW IS A STATE, NOT A DECORATION. The dot on the left says one of three
// things — untouched, in progress, known — and it is the same vocabulary at
// chapter level and at study level, so a course can be read at a glance without
// reading a single number.
//
// The reference product spends a full screen of scrolling on an isometric
// staircase to say "six things, one unlocked". This says the same thing in a
// fifth of the space, which is the only reason to have redrawn it.

import { memo, useMemo } from "react";
import Link from "next/link";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { BookOpen, ChevronDown, Dumbbell } from "lucide-react";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { numbered } from "@/lib/courses/lines";
import type { ChapterUnit } from "@/lib/courses/hub";
import type { ChapterMastery } from "@/lib/learn/courseMastery";
import { courseTrainerHref } from "@/lib/learn/courseRoute";
import { chapterReaderHref, drillHref } from "@/lib/learn/courseHubRoute";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export type UnitState = "untouched" | "learning" | "known";

export function stateOf(mastery: ChapterMastery | undefined): UnitState {
  if (!mastery || mastery.total === 0) return "untouched";
  if (mastery.known >= mastery.total) return "known";
  return mastery.known + mastery.learning > 0 ? "learning" : "untouched";
}

/**
 * The state, as one glyph.
 *
 * A ring that fills. Not a tick and a cross: nothing here is a failure, and a
 * chapter you have not opened yet is not wrong.
 */
export function StateDot({
  state,
  size = 18,
}: {
  state: UnitState;
  size?: number;
}) {
  const known = state === "known";
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: `2px solid ${known || state === "learning" ? ACCENT.main : LINE.strong}`,
        background: known ? ACCENT.main : "transparent",
        display: "grid",
        placeItems: "center",
        transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
      }}
    >
      {state === "learning" && (
        <Box
          sx={{
            width: size / 3,
            height: size / 3,
            borderRadius: "50%",
            background: ACCENT.main,
          }}
        />
      )}
    </Box>
  );
}

/** Known against total, as a bar. Absent when there is nothing to be through. */
export function MiniBar({ known, total }: { known: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.round((known / total) * 100);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 92 }}>
      <Box
        sx={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: LINE.hairline,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${pct}%`,
            background: ACCENT.main,
            borderRadius: 2,
          }}
        />
      </Box>
      <Typography
        sx={{
          ...TYPE.caption,
          color: TEXT.secondary,
          fontVariantNumeric: "tabular-nums",
          minWidth: 42,
          textAlign: "right",
        }}
      >
        {known}/{total}
      </Typography>
    </Box>
  );
}

/** Learn / Train, the pair every unit offers. */
function Actions({
  readHref,
  trainHref,
  drill,
  testid,
}: {
  readHref: string;
  trainHref: string;
  drill?: string;
  testid: string;
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <Pill
        href={readHref}
        icon={<BookOpen size={14} aria-hidden />}
        testid={`${testid}-read`}
      >
        Learn
      </Pill>
      <Pill
        href={trainHref}
        icon={<Dumbbell size={14} aria-hidden />}
        ember
        testid={`${testid}-train`}
      >
        Train
      </Pill>
      {drill && (
        <Pill
          href={drill}
          icon={<Dumbbell size={14} aria-hidden />}
          testid={`${testid}-drill`}
        >
          Drill
        </Pill>
      )}
    </Box>
  );
}

export function Pill({
  href,
  icon,
  children,
  ember,
  testid,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  ember?: boolean;
  testid?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }} data-testid={testid}>
      <Box
        sx={{
          // Train is the quiet tinted action; the rest are outlined.
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          minHeight: 40,
          px: 2,
          borderRadius: `${RADIUS.pill}px`,
          fontSize: TYPE.bodySmall.fontSize,
          fontWeight: 600,
          border: `1px solid ${ember ? ACCENT.border : LINE.strong}`,
          background: ember ? ACCENT.tint : "transparent",
          color: ember ? ACCENT.hover : TEXT.primary,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
          "&:hover": {
            background: ember
              ? alpha(ACCENT.main, 0.22)
              : "rgba(255,255,255,0.06)",
            borderColor: ember ? ACCENT.border : TEXT.secondary,
          },
          "&:active": { transform: MOTION.pressScale },
          "a:focus-visible > &": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: 2,
          },
        }}
      >
        {icon}
        {children}
      </Box>
    </Link>
  );
}

interface Props {
  courseId: string;
  side: "white" | "black";
  unit: ChapterUnit;
  mastery: ChapterMastery | undefined;
  open: boolean;
  onToggle: () => void;
  /** Position in the list, for the numeral. */
  index: number;
}

function ChapterRow({
  courseId,
  side,
  unit,
  mastery,
  open,
  onToggle,
  index,
}: Props) {
  const state = stateOf(mastery);
  const label = unit.title ?? numbered(unit.line);
  const studyMastery = useMemo(() => mastery, [mastery]);

  return (
    <Box
      data-testid={`chapter-${unit.i}`}
      data-state={state}
      sx={{
        borderRadius: `${RADIUS.card}px`,
        border: `1px solid ${LINE.hairline}`,
        background: SURFACE.raised,
        overflow: "hidden",
        transition: `border-color ${MOTION.hover}`,
        "&:hover": { borderColor: LINE.strong },
      }}
    >
      <Box
        component="button"
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          appearance: "none",
          background: "none",
          border: "none",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          textAlign: "left",
          px: { xs: 1.5, md: 2 },
          py: 1.5,
          minHeight: 68,
          cursor: "pointer",
          color: "inherit",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          transition: `background-color ${MOTION.hover}`,
          "&:hover": { background: "rgba(255,255,255,0.06)" },
          "&:active": { background: SURFACE.raisedTertiary },
          "&:focus-visible": {
            outline: `2px solid ${TEXT.primary}`,
            outlineOffset: -2,
          },
        }}
      >
        <StateDot state={state} />
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
          {/* 72, not 52. Eight squares across 52px is under 7px a piece and
              the board reads as texture — the same measurement that took the
              catalogue's diagrams from 62 to 104. */}
          <OpeningDiagram moves={unit.line} side={side} px={72} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
            Chapter {index + 1}
          </Typography>
          <Typography
            sx={{
              ...TYPE.bodySmall,
              fontFamily: FONT_MONO,
              color: TEXT.primary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ ...TYPE.caption, color: TEXT.secondary, mt: 0.25 }}>
            {Math.round(unit.share * 100)}% of what you meet · {unit.decisions}{" "}
            {unit.decisions === 1 ? "decision" : "decisions"}
            {unit.studies.length > 0 ? ` · ${unit.studies.length} studies` : ""}
          </Typography>
          {/* Owed, not overdue-shaming: a count and nothing else. */}
          {(mastery?.due ?? 0) > 0 && (
            <Typography
              data-testid={`chapter-due-${unit.i}`}
              sx={{
                ...TYPE.caption,
                color: TEXT.primary,
                fontWeight: 600,
                mt: 0.2,
              }}
            >
              {mastery!.due} due back
            </Typography>
          )}
        </Box>
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <MiniBar known={studyMastery?.known ?? 0} total={unit.asked} />
        </Box>
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            color: TEXT.secondary,
            transform: open ? "rotate(180deg)" : "none",
            transition: `transform ${MOTION.hover}`,
          }}
        >
          <ChevronDown size={16} aria-hidden />
        </Box>
      </Box>

      {open && (
        <Box sx={{ px: { xs: 1.5, md: 2 }, pb: 2, display: "grid", gap: 1.25 }}>
          <Box sx={{ display: { xs: "block", md: "none" } }}>
            <MiniBar known={studyMastery?.known ?? 0} total={unit.asked} />
          </Box>

          {unit.asked === 0 ? (
            <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
              Nothing to decide here at your level: their replies run out before
              you have to choose again.
            </Typography>
          ) : (
            <Actions
              readHref={chapterReaderHref(courseId, unit.i)}
              trainHref={courseTrainerHref(courseId, unit.i)}
              drill={drillHref(courseId, unit.i)}
              testid={`chapter-${unit.i}`}
            />
          )}

          {/* Studies, when this chapter is big enough to have them. A flat list
              with a state each, not a second navigation layer. */}
          {unit.studies.length > 0 && (
            <Box sx={{ display: "grid", gap: 0.5, mt: 0.5 }}>
              {unit.studies
                .filter((study) => study.asked > 0)
                .map((study) => (
                  <Box
                    key={study.id}
                    data-testid={`study-${unit.i}-${study.id}`}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      minHeight: 44,
                      px: 1.25,
                      borderRadius: `${RADIUS.control}px`,
                      background: SURFACE.raisedSecondary,
                      border: `1px solid ${LINE.hairline}`,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          ...TYPE.bodySmall,
                          color: TEXT.primary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {study.title}
                      </Typography>
                      <Typography
                        sx={{ ...TYPE.caption, color: TEXT.secondary }}
                      >
                        {Math.round(study.share * 100)}% · {study.asked}{" "}
                        {study.asked === 1 ? "decision" : "decisions"}
                      </Typography>
                    </Box>
                    <Pill
                      href={drillHref(courseId, unit.i, study.id)}
                      testid={`study-drill-${unit.i}-${study.id}`}
                    >
                      Drill
                    </Pill>
                  </Box>
                ))}
            </Box>
          )}

          {/* Never a silent cut. */}
          {unit.capped && (
            <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
              A session asks the {unit.asked} most likely of these.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export default memo(ChapterRow);
