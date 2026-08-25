import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { memo } from "react";
import OpeningDiagram from "@/components/learn/OpeningDiagram";
import { CHARACTER_STYLE } from "@/lib/repertoire/character";
import { numberedLine } from "@/lib/repertoire/bracket";
import { progressOf, type CatalogueEntry, type CourseProgress } from "@/lib/courses/catalogue";

const EMBER = "#FB923C";
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
const GOOD = "#86EFAC";

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
      aria-label={`${entry.name} — ${
        due > 0
          ? `${due} ${due === 1 ? "decision" : "decisions"} due back, `
          : ""
      }${started ? `continue, ${progress?.started} of ${entry.chapters} chapters started` : `start, ${entry.chapters} chapters`}`}
      sx={{
        position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column",
        width: { xs: 250, sm: 286 }, flexShrink: 0,
        p: 1.75, borderRadius: "1.15rem", textDecoration: "none",
        border: `1px solid ${style.colour}2E`,
        borderLeft: `3px solid ${style.colour}`,
        background: `linear-gradient(150deg, ${style.colour}12 0%, ${style.colour}07 45%, rgba(255,255,255,0.028) 82%)`,
        transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease",
        "&:hover": {
          borderColor: `${style.colour}70`,
          background: `linear-gradient(150deg, ${style.colour}22 0%, ${style.colour}10 45%, rgba(255,255,255,0.05) 82%)`,
          transform: "translateY(-2px)",
        },
        "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 },
      }}
    >

      {/* The board sits ABOVE the name rather than beside it, and at 104px
          rather than 62. A chessboard is eight squares wide, so a 62px tile
          gives each piece under 8px and every opening renders as the same dark
          smudge — the tile was decoration pretending to be information. At
          104px a square is 13px and the pieces are legible, which is the whole
          reason to show a position instead of an emblem. */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, mb: 1.25 }}>
        <Box
          sx={{
            borderRadius: "0.7rem", overflow: "hidden", lineHeight: 0,
            flexShrink: 0, border: `1px solid ${style.colour}3D`,
          }}
        >
          <OpeningDiagram moves={entry.diagram} side={entry.side} px={104} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.75 }}>
          {/* Due outranks "In progress" and REPLACES it. Both would be true at
              once on every owed card, and two badges stacked on a 250px tile is
              a badge nobody reads — the more specific one wins. */}
          {due > 0 ? (
            <Typography
              data-testid={`card-due-${entry.id}`}
              sx={{
                px: 0.9, py: 0.25, borderRadius: "0.4rem", fontSize: "0.66rem",
                fontWeight: 700, color: "#0B0D12", background: EMBER, whiteSpace: "nowrap",
              }}
            >
              {due} due
            </Typography>
          ) : started ? (
            <Typography
              sx={{
                px: 0.9, py: 0.25, borderRadius: "0.4rem", fontSize: "0.66rem",
                fontWeight: 700, color: "#0B0D12", background: GOOD, whiteSpace: "nowrap",
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
                fontWeight: 800, fontSize: "3.4rem", lineHeight: 0.85,
                color: "rgba(255,255,255,0.09)", userSelect: "none", mt: "auto",
              }}
            >
              {rank}
            </Typography>
          )}
        </Box>
      </Box>

      <Typography
        sx={{
          color: "#fff", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.3,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entry.name}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mt: 0.4, mb: 1 }}>
        <Typography sx={{ color: style.colour, fontSize: "0.7rem" }}>{style.label}</Typography>
        {/* The line that defines the course. The name means nothing to somebody
            who does not already know it; the moves do. */}
        <Typography sx={{ fontFamily: MONO, fontSize: "0.68rem", color: "rgba(255,255,255,0.35)" }}>
          {numberedLine(entry.root)}
        </Typography>
      </Box>

      <Typography
        sx={{
          color: "rgba(255,255,255,0.55)", fontSize: "0.79rem", lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden", minHeight: "3.55em", mb: 1.25,
        }}
      >
        {/* No blurb is left blank rather than filled with a generated sentence.
            Every one of these is authored; a model-written stand-in would be
            indistinguishable on the page and is not something we ship. */}
        {entry.blurb || `${entry.chapters} chapters, ${entry.lines.toLocaleString()} lines.`}
      </Typography>

      <Box sx={{ mt: "auto", display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {started ? (
            <>
              <Typography sx={{ color: GOOD, fontSize: "0.72rem", fontWeight: 700, mb: 0.4 }}>
                {Math.round(done * 100)}%
              </Typography>
              <Box
                role="img"
                aria-label={`${Math.round(done * 100)} percent of chapters started`}
                sx={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.09)" }}
              >
                <Box sx={{ width: `${Math.round(done * 100)}%`, height: "100%", borderRadius: 3, background: GOOD }} />
              </Box>
            </>
          ) : (
            <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}>
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
            flexShrink: 0, px: 1.4, py: 0.7, borderRadius: "0.6rem",
            fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap",
            border: `1px solid ${started ? "rgba(134,239,172,0.4)" : "rgba(255,255,255,0.16)"}`,
            background: started ? "rgba(134,239,172,0.1)" : "rgba(255,255,255,0.05)",
            color: started ? GOOD : "rgba(255,255,255,0.82)",
          }}
        >
          {started ? "Continue" : "Start"}
        </Box>
      </Box>
    </Box>
  );
}

export default memo(CourseCard);
