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

const EMBER = "#FB923C";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type State =
  | { at: "loading" }
  | { at: "ready"; positions: Position[] }
  | { at: "failed" };

export interface CourseExplorerProps {
  courseId: string;
  courseName: string;
  onClose: () => void;
}

export function CourseExplorer({ courseId, courseName, onClose }: CourseExplorerProps) {
  const [state, setState] = useState<State>({ at: "loading" });
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/opening-courses/${encodeURIComponent(courseId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { chapters: CourseChapter[]; nodes: Record<string, CourseNode> }) => {
        if (!live) return;
        setState({ at: "ready", positions: positionsOf(data.nodes, data.chapters) });
      })
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
        background: "rgba(6,8,12,0.72)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={stop}
        sx={{
          width: "100%",
          maxWidth: 640,
          maxHeight: { xs: "86dvh", md: "72dvh" },
          display: "flex",
          flexDirection: "column",
          borderRadius: { xs: "1.5rem 1.5rem 0 0", md: "1.5rem" },
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(16,18,24,0.96)",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, py: 1.5, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Search size={16} color="rgba(255,255,255,0.45)" aria-hidden />
          <Box
            component="input"
            ref={input}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Moves — d4 d5 Bf4"
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
              color: "#fff",
              fontFamily: MONO,
              fontSize: "1rem",
              "&::placeholder": { color: "rgba(255,255,255,0.32)" },
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
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              "&:hover": { color: "#fff" },
            }}
          >
            <X size={18} aria-hidden />
          </Box>
        </Box>

        <Box sx={{ overflowY: "auto", px: 1, py: 1 }}>
          {state.at === "loading" && <Note>Reading the course…</Note>}
          {state.at === "failed" && <Note>The course is not loading. Nothing is lost.</Note>}
          {state.at === "ready" && query.trim().length === 0 && (
            <Note>
              Type the moves. {state.positions.length.toLocaleString()} positions in this course at
              your level.
            </Note>
          )}
          {state.at === "ready" && query.trim().length > 0 && hits.length === 0 && (
            <Note data-testid="explorer-empty">
              Nothing in this course reaches that. It may be past the depth for your level, or
              below the share the course covers.
            </Note>
          )}
          {hits.map(position => (
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
                  borderRadius: "0.9rem",
                  transition: "background 180ms ease-out",
                  "&:hover": { background: "rgba(255,255,255,0.06)" },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: MONO,
                      fontSize: "0.84rem",
                      color: "rgba(255,255,255,0.92)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {numbered(position.line)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}>
                    {/* Whose move it is, because that is what decides whether
                        this is a position you are asked about or one you meet. */}
                    {position.ours ? "your move" : "their move"}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: "0.72rem", color: EMBER }}>Open</Typography>
              </Box>
            </Link>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function Note({ children, ...rest }: { children: React.ReactNode; "data-testid"?: string }) {
  return (
    <Typography
      {...rest}
      sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.85rem", px: 1.5, py: 2, lineHeight: 1.6 }}
    >
      {children}
    </Typography>
  );
}
