/**
 * /calibrate — standalone coach-response rater.
 *
 * Fetches a static, auto-score-free packet of coach responses from
 * /calibration-data.json and lets a human rate each one across the 7
 * helpfulness dimensions (each 0 / 1 / 2). Ratings autosave to localStorage,
 * keyed by rater name, and export to a JSON file in the documented shape.
 *
 * Standalone on purpose: no jotai atoms, no auth/useViewer, no app board
 * wrappers, no useLocalStorage hook (it throws pre-hydration). Raw localStorage
 * + native Blob download keep this self-contained. Dimension definitions and
 * the export shape live in @/lib/calibrate/calibrationExport (JSX-free,
 * unit-tested).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Chessboard } from "react-chessboard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageTitle } from "@/components/pageTitle";
import {
  buildExport,
  CalibrationData,
  CalibrationItem,
  cleanCoachText,
  DIMENSIONS,
  DimKey,
  DimScore,
  formatCpDelta,
  isItemFullyRated,
  NotesState,
  RatingsState,
} from "@/lib/calibrate/calibrationExport";

const RATER_KEY = "calibrate.rater";
const ratingsKey = (rater: string) => `calibrate.ratings.${rater}`;
const notesKey = (rater: string) => `calibrate.notes.${rater}`;

export default function CalibratePage() {
  const [items, setItems] = useState<CalibrationItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [rater, setRater] = useState("");
  const [ratings, setRatings] = useState<RatingsState>({});
  const [notes, setNotes] = useState<NotesState>({});

  // effect A: fetch the calibration packet once.
  useEffect(() => {
    let cancelled = false;
    fetch("/calibration-data.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CalibrationData) => {
        if (cancelled) return;
        if (!data || !Array.isArray(data.items)) {
          throw new Error("calibration-data.json missing an `items` array");
        }
        setItems(data.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(`Could not load /calibration-data.json: ${msg}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // effect B: on mount, restore the rater name.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(RATER_KEY);
    if (saved) setRater(saved);
  }, []);

  // effect C: when the rater changes, persist the name and re-hydrate that
  // rater's ratings (so switching names restores prior work and two raters on
  // one machine never collide).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RATER_KEY, rater);
    if (!rater) {
      setRatings({});
      setNotes({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(ratingsKey(rater));
      setRatings(raw ? (JSON.parse(raw) as RatingsState) : {});
    } catch {
      setRatings({});
    }
    try {
      const rawN = window.localStorage.getItem(notesKey(rater));
      setNotes(rawN ? (JSON.parse(rawN) as NotesState) : {});
    } catch {
      setNotes({});
    }
  }, [rater]);

  // persist ratings on every change (keyed by current rater).
  const persistRatings = useCallback(
    (next: RatingsState) => {
      if (typeof window === "undefined" || !rater) return;
      window.localStorage.setItem(ratingsKey(rater), JSON.stringify(next));
    },
    [rater]
  );

  const setDim = useCallback(
    (itemId: string, key: DimKey, value: DimScore) => {
      setRatings((prev) => {
        const next: RatingsState = {
          ...prev,
          [itemId]: { ...prev[itemId], [key]: value },
        };
        persistRatings(next);
        return next;
      });
    },
    [persistRatings]
  );

  const persistNotes = useCallback(
    (next: NotesState) => {
      if (typeof window === "undefined" || !rater) return;
      window.localStorage.setItem(notesKey(rater), JSON.stringify(next));
    },
    [rater]
  );

  const setNote = useCallback(
    (itemId: string, text: string) => {
      setNotes((prev) => {
        const next: NotesState = { ...prev, [itemId]: text };
        persistNotes(next);
        return next;
      });
    },
    [persistNotes]
  );

  const fullyRatedCount = useMemo(() => {
    if (!items) return 0;
    return items.reduce(
      (acc, it) => acc + (isItemFullyRated(ratings[it.id]) ? 1 : 0),
      0
    );
  }, [items, ratings]);

  const boardWidth = 440;

  const handleExport = useCallback(() => {
    if (!items || !rater) return;
    const { payload, excludedCount } = buildExport(rater, items, ratings, notes);
    if (payload.ratings.length === 0) {
      window.alert("No fully-rated items to export yet.");
      return;
    }
    if (excludedCount > 0) {
      const ok = window.confirm(
        `${excludedCount} item(s) are not fully rated and will be excluded. Export the ${payload.ratings.length} completed item(s)?`
      );
      if (!ok) return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calibration-${rater || "rater"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, rater, ratings, notes]);

  const current = items && items.length > 0 ? items[idx] : null;
  const total = items?.length ?? 0;

  return (
    <>
      <PageTitle title="Coach Calibration" />
      <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 } }}>
        {/* Header: rater name + progress + export */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            mb: 3,
          }}
        >
          <Typography variant="h4" sx={{ fontWeight: 700, mr: "auto" }}>
            Coach Calibration
          </Typography>
          <TextField
            label="Rater name"
            size="small"
            value={rater}
            onChange={(e) => setRater(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <Typography variant="body2" color="text.secondary">
            {fullyRatedCount} / {total} fully rated
          </Typography>
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={
              !rater ||
              (fullyRatedCount === 0 && !Object.values(notes).some((n) => n.trim()))
            }
          >
            Export ratings JSON
          </Button>
        </Box>

        {loadError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}

        {!items && !loadError && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {items && items.length === 0 && (
          <Alert severity="info">
            /calibration-data.json has no items to rate.
          </Alert>
        )}

        {current && (
          <Grid container spacing={2}>
            {/* LEFT: read-only board */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Box sx={{ width: boardWidth, maxWidth: "100%" }}>
                  <Chessboard
                    id="CalibrateBoard"
                    position={current.fen}
                    boardWidth={boardWidth}
                    arePiecesDraggable={false}
                    customBoardStyle={{
                      borderRadius: 8,
                      boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
                    }}
                  />
                </Box>
              </Box>
            </Grid>

            {/* RIGHT: facts + coach text + rubric */}
            <Grid size={{ xs: 12, md: 7 }}>
              {/* Facts panel */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Position facts
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: 2,
                    rowGap: 0.5,
                    mt: 0.5,
                  }}
                >
                  <FactLabel>ID</FactLabel>
                  <FactValue>{current.id}</FactValue>
                  <FactLabel>Move played</FactLabel>
                  <FactValue>{current.movePlayedSan}</FactValue>
                  <FactLabel>Best move</FactLabel>
                  <FactValue>{current.bestMoveSan}</FactValue>
                  <FactLabel>Eval delta (mover POV)</FactLabel>
                  <FactValue>
                    {formatCpDelta(current.evalDeltaCpMoverPov)}
                  </FactValue>
                  <FactLabel>Classification</FactLabel>
                  <FactValue>{current.classification}</FactValue>
                  <FactLabel>User rating</FactLabel>
                  <FactValue>{current.userRating}</FactValue>
                  <FactLabel>Tier</FactLabel>
                  <FactValue>{current.tier}</FactValue>
                </Box>
              </Paper>

              {/* Coach text */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Coach response
                </Typography>
                <Box
                  sx={{
                    mt: 0.5,
                    "& p": { mt: 0, mb: 1 },
                    "& p:last-child": { mb: 0 },
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {cleanCoachText(current.coachText)}
                  </ReactMarkdown>
                </Box>
              </Paper>

              {/* Rubric rows */}
              <Paper sx={{ p: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Rate (0 / 1 / 2 / N/A)
                </Typography>
                {DIMENSIONS.map((dim) => (
                  <DimRow
                    key={dim.key}
                    label={dim.label}
                    rubric={dim.rubric}
                    value={ratings[current.id]?.[dim.key] ?? null}
                    onChange={(v) => setDim(current.id, dim.key, v)}
                  />
                ))}
              </Paper>

              {/* Free-text notes / issue flag */}
              <Paper sx={{ p: 2, mt: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Notes / flag an issue (optional)
                </Typography>
                <TextField
                  multiline
                  minRows={2}
                  fullWidth
                  size="small"
                  placeholder="e.g. duplicate position, bad fixture, coach response is off, or anything worth flagging…"
                  value={notes[current.id] ?? ""}
                  onChange={(e) => setNote(current.id, e.target.value)}
                  sx={{ mt: 0.5 }}
                />
              </Paper>
            </Grid>

            {/* NAV row */}
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  mt: 1,
                }}
              >
                <Button
                  variant="outlined"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                >
                  Prev
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {idx + 1} / {total}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                  disabled={idx >= total - 1}
                >
                  Next
                </Button>
              </Box>
            </Grid>
          </Grid>
        )}
      </Box>
    </>
  );
}

// --- small presentational helpers -----------------------------------------

function FactLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
      {children}
    </Typography>
  );
}

function FactValue({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
      {children}
    </Typography>
  );
}

function DimRow({
  label,
  rubric,
  value,
  onChange,
}: {
  label: string;
  rubric: string;
  value: DimScore | null;
  onChange: (v: DimScore) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        py: 1.25,
        borderTop: "1px solid",
        borderColor: "divider",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {rubric}
        </Typography>
      </Box>
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        // Guard with `!== null` (not truthy) so a "0" selection registers.
        onChange={(_, v: DimScore | null) => {
          if (v !== null) onChange(v);
        }}
        aria-label={label}
      >
        <ToggleButton value={0}>0</ToggleButton>
        <ToggleButton value={1}>1</ToggleButton>
        <ToggleButton value={2}>2</ToggleButton>
        <ToggleButton value="na">N/A</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
