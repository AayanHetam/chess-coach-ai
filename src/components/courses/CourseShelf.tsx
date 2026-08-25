import { Box, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import CourseCard from "@/components/courses/CourseCard";
import type { CourseProgress, Shelf } from "@/lib/courses/catalogue";

const EMBER = "#FB923C";

/**
 * One horizontal rail of courses.
 *
 * Native scroll, not a transform carousel. It keeps the touch and trackpad
 * gestures people already have, keeps every card reachable by Tab, and means a
 * shelf that happens to fit needs no arrows at all — which is checked rather
 * than assumed, because arrows that do nothing are worse than none.
 */
export default function CourseShelf({
  shelf,
  progress,
}: {
  shelf: Shelf;
  progress: ReadonlyMap<string, CourseProgress>;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    // 2px of slack: sub-pixel layout makes scrollLeft land a fraction short of
    // the true end, which would leave the right arrow permanently lit.
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, shelf.entries.length]);

  const nudge = (direction: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          {/* An empty title would emit a blank <h2>, which a screen reader
              announces as a heading with no name. */}
          {shelf.title && (
            <Typography component="h2" sx={{ color: "#fff", fontSize: "1.05rem", fontWeight: 700 }}>
              {shelf.title}
            </Typography>
          )}
          {shelf.note && (
            <Typography sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.8rem", mt: 0.3 }}>
              {shelf.note}
            </Typography>
          )}
        </Box>
        {/* Arrows are a convenience over a scroller that already works, so they
            are hidden from assistive tech rather than announced as the only way
            through — a keyboard user Tabs the cards and the rail follows. */}
        <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.5, flexShrink: 0 }} aria-hidden>
          {([-1, 1] as const).map((direction) => {
            const live = direction === -1 ? edges.left : edges.right;
            return (
              <Box
                key={direction}
                component="button"
                tabIndex={-1}
                onClick={() => nudge(direction)}
                disabled={!live}
                sx={{
                  display: "grid", placeItems: "center", width: 30, height: 30,
                  borderRadius: "50%", cursor: live ? "pointer" : "default",
                  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
                  color: live ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
                  transition: "color 180ms ease, border-color 180ms ease",
                  "&:hover": live ? { borderColor: EMBER, color: EMBER } : {},
                }}
              >
                {direction === -1 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box
        ref={rail}
        onScroll={measure}
        sx={{
          display: "flex", gap: 1.5, overflowX: "auto", pb: 1,
          scrollSnapType: "x proximity",
          // The rail scrolls; the page must not. A shelf wider than the
          // viewport is the normal case here, and without this the whole
          // document gains a horizontal scrollbar.
          "& > *": { scrollSnapAlign: "start" },
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": { height: 6 },
          "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.12)", borderRadius: 3 },
        }}
      >
        {shelf.entries.map((entry, i) => (
          <CourseCard
            key={entry.id}
            entry={entry}
            progress={progress.get(entry.id)}
            rank={shelf.ranked ? i + 1 : undefined}
          />
        ))}
      </Box>
    </Box>
  );
}
