// The explorer: find a position in this course.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT FETCHES, RATHER THAN THE HUB CARRYING THE GRAPH
//
// The hub is server-rendered and a course's nodes run to 207 KB at the strong
// band. Shipping that with every hub load to serve a dialog most visits never
// open would be paying the whole cost for the rare case. `/api/opening-courses`
// already exists, already cuts to the caller's band on the server, and is
// already the one place that decides what a player may see — so the dialog
// asks it, and cannot be handed anything the hub could not have shown.
//
// The search matches MOVES. Names would be better and we do not have them per
// node: the corpus names openings, not the three thousand positions inside one.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { numbered } from "@/lib/courses/lines";
import { positionsOf, search, type Position } from "@/lib/courses/explore";
import { readerLineHref } from "@/lib/learn/courseHubRoute";
import type { CourseChapter, CourseNode } from "@/types/course";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MATERIAL,
  MOTION,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

type State =
  | { at: "loading" }
  | { at: "ready"; positions: Position[] }
  | { at: "failed" };

export interface CourseExplorerProps {
  courseId: string;
  courseName: string;
  onClose: () => void;
}

export function CourseExplorer({
  courseId,
  courseName,
  onClose,
}: CourseExplorerProps) {
  const [state, setState] = useState<State>({ at: "loading" });
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/opening-courses/${encodeURIComponent(courseId)}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
      )
      .then(
        (data: {
          chapters: CourseChapter[];
          nodes: Record<string, CourseNode>;
        }) => {
          if (!live) return;
          setState({
            at: "ready",
            positions: positionsOf(data.nodes, data.chapters),
          });
        }
      )
      .catch(() => live && setState({ at: "failed" }));
    return () => {
      live = false;
    };
  }, [courseId]);

  // Escape closes, because this is a dialog and that is what a dialog does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    input.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hits = useMemo(
    () => (state.at === "ready" ? search(state.positions, query) : []),
    [state, query]
  );

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-label={`Find a position in ${courseName}`}
      data-testid="course-explorer"
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        alignItems: { xs: "flex-end", md: "flex-start" },
        justifyContent: "center",
        pt: { md: 10 },
        px: { xs: 0, md: 2 },
        background: MATERIAL.scrim,
      }}
    >
      {/* A dialog opening: one short cross-fade from just below its place. */}
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={stop}
        sx={{
          width: "100%",
          maxWidth: 640,
          maxHeight: { xs: "86dvh", md: "72dvh" },
          display: "flex",
          flexDirection: "column",
          borderRadius: {
            xs: `${RADIUS.sheet}px ${RADIUS.sheet}px 0 0`,
            md: `${RADIUS.sheet}px`,
          },
          border: `1px solid ${LINE.hairline}`,
          background: SURFACE.overlay,
          boxShadow: SHADOW.modal,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${LINE.hairline}`,
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
            ref={input}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(e.target.value)
            }
            placeholder="Moves, like d4 d5 Bf4"
            aria-label="Moves to find"
            data-testid="explorer-input"
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              appearance: "none",
              border: "none",
              background: "none",
              outline: "none",
              color: TEXT.primary,
              fontFamily: FONT_MONO,
              fontSize: TYPE.bodySmall.fontSize,
              "&::placeholder": { color: TEXT.tertiary },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
                outlineOffset: -2,
              },
            }}
          />
          <Box
            component="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="explorer-close"
            sx={{
              appearance: "none",
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              flexShrink: 0,
              border: "none",
              background: "none",
              color: TEXT.secondary,
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              transition: `color ${MOTION.hover}, transform ${MOTION.press}`,
              "&:hover": { color: TEXT.primary },
              "&:active": { transform: MOTION.pressScale },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
                outlineOffset: -2,
              },
            }}
          >
            <X size={18} aria-hidden />
          </Box>
        </Box>

        <Box sx={{ overflowY: "auto", px: 1, py: 1 }}>
          {state.at === "loading" && <Note>Reading the course</Note>}
          {state.at === "failed" && (
            <Note>The course is not loading. Nothing is lost.</Note>
          )}
          {state.at === "ready" && query.trim().length === 0 && (
            <Note>
              Type the moves. {state.positions.length.toLocaleString()}{" "}
              positions in this course at your level.
            </Note>
          )}
          {state.at === "ready" &&
            query.trim().length > 0 &&
            hits.length === 0 && (
              <Note data-testid="explorer-empty">
                Nothing in this course reaches that. It may be past the depth
                for your level, or below the share the course covers.
              </Note>
            )}
          {hits.map((position) => (
            <Link
              key={position.key}
              href={readerLineHref(courseId, position.chapter, position.line)}
              style={{ textDecoration: "none" }}
              data-testid={`explorer-hit-${position.line.join("_")}`}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  minHeight: 52,
                  px: 1.5,
                  borderRadius: `${RADIUS.small}px`,
                  transition: `background-color ${MOTION.hover}`,
                  "&:hover": { background: "rgba(255,255,255,0.06)" },
                  "&:active": { background: SURFACE.raisedTertiary },
                  "a:focus-visible > &": {
                    outline: `2px solid ${TEXT.primary}`,
                    outlineOffset: -2,
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
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
                    {numbered(position.line)}
                  </Typography>
                  <Typography sx={{ ...TYPE.caption, color: TEXT.secondary }}>
                    {/* Whose move it is, because that is what decides whether
                        this is a position you are asked about or one you meet. */}
                    {position.ours ? "your move" : "their move"}
                  </Typography>
                </Box>
                <Typography
                  sx={{ ...TYPE.caption, fontWeight: 600, color: ACCENT.hover }}
                >
                  Open
                </Typography>
              </Box>
            </Link>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function Note({
  children,
  ...rest
}: {
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Typography
      {...rest}
      sx={{ ...TYPE.bodySmall, color: TEXT.secondary, px: 1.5, py: 2 }}
    >
      {children}
    </Typography>
  );
}
