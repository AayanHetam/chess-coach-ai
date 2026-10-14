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
import { useAuth } from "@/contexts/AuthContext";
import {
  pushConfigured,
  subscribeToPush,
  unsubscribeFromPush,
  currentPushEndpoint,
} from "@/lib/pushClient";
import { LINE, TEXT, TYPE } from "@/theme/tokens";

/**
 * The daily puzzle goal, and reminders.
 *
 * This card used to own a TARGET RATING too. /plan now has a real goal setter
 * above it (GoalSetterCard / GoalProgressCard, `profile.goalRating`), and when
 * the page was finally looked at on a screen it had two "Set a goal" buttons —
 * writing DIFFERENT fields, scored on DIFFERENT scales. This one measured
 * progress against `stats.rating`, the PUZZLE rating, so a 1805 Chess.com
 * player setting 2000 here would have been told they were 800 points short.
 *
 * The rating half is gone rather than reconciled: one goal, one writer
 * (`buildGoalPatch`). Any `goals.targetRating` already stored is left untouched
 * — it is simply no longer offered or displayed.
 */
export default function GoalsCard() {
  const { profile, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [perDay, setPerDay] = useState(
    String(profile?.goals?.puzzlesPerDay ?? "")
  );
  const [saving, setSaving] = useState(false);

  const perDayGoal = profile?.goals?.puzzlesPerDay;

  const [pushBusy, setPushBusy] = useState(false);
  const canPush = pushConfigured();
  const pushOn = (profile?.pushSubscriptions?.length ?? 0) > 0;

  const togglePush = async (enable: boolean) => {
    setPushBusy(true);
    try {
      if (enable) {
        const sub = await subscribeToPush();
        if (sub) {
          const existing = profile?.pushSubscriptions ?? [];
          const deduped = [
            sub,
            ...existing.filter((s) => s.endpoint !== sub.endpoint),
          ].slice(0, 10);
          await updateProfile({ pushSubscriptions: deduped });
        }
      } else {
        const ep = await currentPushEndpoint();
        await unsubscribeFromPush();
        const remaining = (profile?.pushSubscriptions ?? []).filter(
          (s) => s.endpoint !== ep
        );
        await updateProfile({ pushSubscriptions: remaining });
      }
    } catch (e) {
      console.error("Toggle push failed:", e);
    } finally {
      setPushBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const d = parseInt(perDay, 10);
      await updateProfile({
        goals: {
          ...(profile?.goals ?? {}),
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
        <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
          Daily goal
        </Typography>
        {!editing && (
          <Button
            variant="text"
            size="small"
            onClick={() => setEditing(true)}
            sx={{ color: TEXT.secondary, minWidth: 0 }}
          >
            {perDayGoal ? "Edit" : "Set"}
          </Button>
        )}
      </Box>

      {editing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            size="small"
            type="number"
            label="Puzzles per day"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" onClick={save} disabled={saving}>
              Save
            </Button>
            <Button
              variant="text"
              onClick={() => setEditing(false)}
              sx={{ color: TEXT.secondary }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      ) : perDayGoal ? (
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
          {perDayGoal} puzzles a day.
        </Typography>
      ) : (
        <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
          Set how many puzzles a day you want to aim for.
        </Typography>
      )}

      <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${LINE.hairline}` }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!profile?.reminderPrefs?.enabled}
              onChange={(e) =>
                void updateProfile({
                  reminderPrefs: { enabled: e.target.checked },
                }).catch(() => {})
              }
            />
          }
          label={
            <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
              Daily email reminders
            </Typography>
          }
        />
        {canPush && (
          <FormControlLabel
            control={
              <Switch
                checked={pushOn}
                disabled={pushBusy}
                onChange={(e) => void togglePush(e.target.checked)}
              />
            }
            label={
              <Typography sx={{ ...TYPE.bodySmall, color: TEXT.primary }}>
                Push notifications
              </Typography>
            }
          />
        )}
      </Box>
    </Box>
  );
}
