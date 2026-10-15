import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { memo } from "react";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { CHARACTER_STYLE } from "@/lib/repertoire/character";
import { numberedLine } from "@/lib/repertoire/bracket";
import {
  progressOf,
  type CatalogueEntry,
  type CourseProgress,
} from "@/lib/courses/catalogue";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/**
 * One course on a shelf.
 *
 * The tile is the POSITION rather than an emblem. A reference catalogue can
 * afford drawn artwork per course; we have 43 courses and no illustrator, and
 * the honest substitute is better than a stand-in anyway — the board says what
 * the opening looks like, which is the thing a name cannot do for somebody who
 * does not already know the name.
 *
 * The whole card is one link. Splitting the title and a "Start course" button
 * into separate targets gives two hit areas for one intent and makes the card
 * body dead space on a touch screen.
 */
function CourseCard({
  entry,
  progress,
  rank,
}: {
  entry: CatalogueEntry;
  progress: CourseProgress | undefined;
  /** 1-based position on a ranked shelf; undefined elsewhere. */
  rank?: number;
}) {
  const style = CHARACTER_STYLE[entry.character];
  const done = progressOf(entry, progress);
  const started = done > 0;
  const due = progress?.due ?? 0;
  return (
    <Box
      component={Link}
      href={`/learn/${encodeURIComponent(entry.id)}`}
      /* The debt goes FIRST in the accessible name when there is any: it is
         the most specific true thing about this card, and a screen reader
         should not have to hear the chapter count before the reason to open
         it. */
      aria-label={`${entry.name}, ${
        due > 0
          ? `${due} ${due === 1 ? "decision" : "decisions"} due back, `
          : ""
      }${started ? `continue, ${progress?.started} of ${entry.chapters} chapters started` : `start, ${entry.chapters} chapters`}`}
      sx={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        width: { xs: 250, sm: 286 },
        flexShrink: 0,
        p: 1.75,
        borderRadius: `${RADIUS.card}px`,
        textDecoration: "none",
        border: `1px solid ${LINE.hairline}`,
        // The character's colour, as the one category marker on the card.
        borderLeft: `3px solid ${style.colour}`,
        background: SURFACE.raised,
        transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}`,
        "&:hover": { borderColor: LINE.strong, borderLeftColor: style.colour },
        "&:active": { background: SURFACE.raisedTertiary },
        "&:focus-visible": {
          outline: `2px solid ${TEXT.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      {/* The board sits ABOVE the name rather than beside it, and at 104px
          rather than 62. A chessboard is eight squares wide, so a 62px tile
          gives each piece under 8px and every opening renders as the same dark
          smudge — the tile was decoration pretending to be information. At
          104px a square is 13px and the pieces are legible, which is the whole
          reason to show a position instead of an emblem. */}
      <Box
        sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, mb: 1.25 }}
      >
        <Box
          sx={{
            borderRadius: `${RADIUS.control}px`,
            overflow: "hidden",
            lineHeight: 0,
            flexShrink: 0,
            border: `1px solid ${LINE.hairline}`,
          }}
        >
          <OpeningDiagram moves={entry.diagram} side={entry.side} px={104} />
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 0.75,
          }}
        >
          {/* Due outranks "In progress" and REPLACES it. Both would be true at
              once on every owed card, and two badges stacked on a 250px tile is
              a badge nobody reads — the more specific one wins. */}
          {due > 0 ? (
            /* Review debt is a status, so it is a quiet accent-tinted tag, not
               a solid fill: solid stays reserved for the one primary action. */
            <Typography
              data-testid={`card-due-${entry.id}`}
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: `${RADIUS.small}px`,
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                color: ACCENT.hover,
                background: ACCENT.tint,
                whiteSpace: "nowrap",
              }}
            >
              {due} due
            </Typography>
          ) : started ? (
            <Typography
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: `${RADIUS.small}px`,
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                color: STATUS.success,
                background: STATUS.successTint,
                whiteSpace: "nowrap",
              }}
            >
              In progress
            </Typography>
          ) : null}
          {/* The rank gets its own block beside the tile rather than sitting
              behind the title. Ghosted behind the text it competed with the
              opening's name for the first read and clipped at the card edge. */}
          {rank !== undefined && (
            <Typography
              aria-hidden
              sx={{
                fontWeight: 700,
                fontSize: "3.4rem",
                lineHeight: 0.85,
                fontVariantNumeric: "tabular-nums",
                color: TEXT.tertiary,
                userSelect: "none",
                mt: "auto",
              }}
            >
              {rank}
            </Typography>
          )}
        </Box>
      </Box>

      <Typography
        sx={{
          ...TYPE.h5,
          color: TEXT.primary,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entry.name}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          flexWrap: "wrap",
          mt: 0.4,
          mb: 1,
        }}
      >
        <Typography sx={{ ...TYPE.caption, color: style.colour }}>
          {style.label}
        </Typography>
        {/* The line that defines the course. The name means nothing to somebody
            who does not already know it; the moves do. */}
        <Typography
          sx={{ ...TYPE.caption, fontFamily: FONT_MONO, color: TEXT.secondary }}
        >
          {numberedLine(entry.root)}
        </Typography>
      </Box>

      <Typography
        sx={{
          ...TYPE.bodySmall,
          color: TEXT.secondary,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: "3.55em",
          mb: 1.25,
        }}
      >
        {/* No blurb is left blank rather than filled with a generated sentence.
            Every one of these is authored; a model-written stand-in would be
            indistinguishable on the page and is not something we ship. */}
        {entry.blurb ||
          `${entry.chapters} chapters, ${entry.lines.toLocaleString()} lines.`}
      </Typography>

      <Box
        sx={{ mt: "auto", display: "flex", alignItems: "center", gap: 1.25 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {started ? (
            <>
              <Typography
                sx={{
                  ...TYPE.caption,
                  color: STATUS.success,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  mb: 0.4,
                }}
              >
                {Math.round(done * 100)}%
              </Typography>
              <Box
                role="img"
                aria-label={`${Math.round(done * 100)} percent of chapters started`}
                sx={{ height: 5, borderRadius: 3, background: LINE.hairline }}
              >
                <Box
                  sx={{
                    width: `${Math.round(done * 100)}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: STATUS.success,
                  }}
                />
              </Box>
            </>
          ) : (
            <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
              {entry.chapters} chapters
            </Typography>
          )}
        </Box>
        {/* Looks like a button, is not one. The whole card is already a link,
            and nesting a real <button> inside an <a> gives one intent two
            targets and breaks the tab order for the sake of an affordance the
            card already has. */}
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            px: 1.5,
            py: 0.5,
            borderRadius: `${RADIUS.pill}px`,
            fontSize: TYPE.bodySmall.fontSize,
            fontWeight: 600,
            whiteSpace: "nowrap",
            border: `1px solid ${LINE.strong}`,
            background: "transparent",
            color: TEXT.primary,
          }}
        >
          {started ? "Continue" : "Start"}
        </Box>
      </Box>
    </Box>
  );
}

export default memo(CourseCard);
