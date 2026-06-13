"use client";

import { useState } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useAtomValue } from "jotai";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom } from "@/lib/puzzleRating";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";

const inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: "10px",
    color: "rgba(255,255,255,0.94)",
    "& fieldset": { borderColor: "rgba(255,255,255,0.12)" },
    "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.55)" },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.55)",
    "&.Mui-focused": { color: "#FB923C" },
  },
} as const;

/**
 * Goal-setting: a self-chosen target rating shown as honest current→target
 * progress (NOT a "you'll reach it by date X" projection), plus a daily puzzle
 * goal. Persists to profile.goals.
 */
export default function GoalsCard() {
  const { profile, updateProfile } = useAuth();
  const stats = useAtomValue(puzzleStatsAtom);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(
    String(profile?.goals?.targetRating ?? "")
  );
  const [perDay, setPerDay] = useState(
    String(profile?.goals?.puzzlesPerDay ?? "")
  );
  const [saving, setSaving] = useState(false);

  const targetRating = profile?.goals?.targetRating;
  const current = stats.rating;
  // Honest progress: how far current sits between a sensible floor and the
  // target. No date prediction — just where you are vs where you want to be.
  const pct =
    targetRating && targetRating > current
      ? Math.max(
          0,
          Math.min(
            1,
            (current - (current - 200)) / (targetRating - (current - 200))
          )
        )
      : targetRating
        ? 1
        : 0;

  const save = async () => {
    setSaving(true);
    try {
      const t = parseInt(target, 10);
      const d = parseInt(perDay, 10);
      await updateProfile({
        goals: {
          ...(profile?.goals ?? {}),
          ...(Number.isFinite(t) && t > 0
            ? { targetRating: Math.min(3500, t) }
            : {}),
          ...(Number.isFinite(d) && d > 0
            ? { puzzlesPerDay: Math.min(200, d) }
            : {}),
        },
      });
      setEditing(false);
    } catch (e) {
      console.error("Save goals failed:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem" }}>
          Your goals
        </Typography>
        {!editing && (
          <Button
            onClick={() => setEditing(true)}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.55)",
              fontSize: "0.8rem",
              minWidth: 0,
            }}
          >
            {targetRating ? "Edit" : "Set a goal"}
          </Button>
        )}
      </Box>

      {editing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            size="small"
            type="number"
            label="Target rating"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            sx={inputSx}
          />
          <TextField
            size="small"
            type="number"
            label="Puzzles per day"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            sx={inputSx}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              onClick={save}
              disabled={saving}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                color: "#fff",
                background: ORANGE,
                px: 3,
                borderRadius: "10px",
              }}
            >
              Save
            </Button>
            <Button
              onClick={() => setEditing(false)}
              sx={{ textTransform: "none", color: "rgba(255,255,255,0.6)" }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      ) : targetRating ? (
        <Box>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}
          >
            <Typography
              sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.85rem" }}
            >
              {current} now
            </Typography>
            <Typography
              sx={{ color: "#FB923C", fontSize: "0.85rem", fontWeight: 700 }}
            >
              {targetRating} goal
            </Typography>
          </Box>
          <Box
            sx={{
              height: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${pct * 100}%`,
                borderRadius: 999,
                background: ORANGE,
              }}
            />
          </Box>
          {profile?.goals?.puzzlesPerDay && (
            <Typography
              sx={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.78rem",
                mt: 1,
              }}
            >
              Daily goal: {profile.goals.puzzlesPerDay} puzzles
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}
        >
          Set a target rating to track your progress.
        </Typography>
      )}

      <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!profile?.reminderPrefs?.enabled}
              onChange={(e) =>
                void updateProfile({
                  reminderPrefs: { enabled: e.target.checked },
                }).catch(() => {})
              }
              sx={{
                "& .MuiSwitch-switchBase.Mui-checked": { color: "#FB923C" },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                  backgroundColor: "#F97316",
                },
              }}
            />
          }
          label={
            <Typography
              sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.88rem" }}
            >
              Daily email reminders
            </Typography>
          }
        />
      </Box>
    </Box>
  );
}
