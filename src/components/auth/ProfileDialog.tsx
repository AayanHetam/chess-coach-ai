import { useState, useEffect, FormEvent, KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Avatar,
  Tabs,
  Tab,
  Divider,
  Chip,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Stack,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/AuthContext";
import type {
  CoachTone,
  PlayingStyle,
  StudyGoal,
  BoardTheme,
  PieceSet,
} from "@/lib/firestoreUsers";

type TabKey = "account" | "chess" | "coaching" | "appearance";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Tab to land on. Defaults to "account". /profile's "Add your username" CTA
   * passes "chess" so the user arrives at the field they were sent for rather
   * than having to find it.
   */
  initialTab?: TabKey;
}

const COACH_TONES: { value: CoachTone; label: string; hint: string }[] = [
  { value: "friendly", label: "Friendly", hint: "Warm, encouraging coach voice." },
  { value: "strict", label: "Strict", hint: "Direct feedback, no sugarcoating." },
  { value: "masti", label: "Masti", hint: "Playful & spirited — Chess Masti's house style." },
];

const PLAYING_STYLES: { value: PlayingStyle; label: string; hint: string }[] = [
  { value: "tactical", label: "Tactical", hint: "Sharp lines, sacrifices, attacking play." },
  { value: "positional", label: "Positional", hint: "Long-term plans, structural advantages." },
  { value: "balanced", label: "Balanced", hint: "Mix both — pick the right tool per position." },
];

const STUDY_GOALS: { value: StudyGoal; label: string }[] = [
  { value: "tactics", label: "Tactics" },
  { value: "endgames", label: "Endgames" },
  { value: "openings", label: "Openings" },
  { value: "time-management", label: "Time management" },
];

const BOARD_THEMES: { value: BoardTheme; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "wood", label: "Wood" },
  { value: "neon", label: "Neon" },
];

const PIECE_SETS: { value: PieceSet; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "merida", label: "Merida" },
  { value: "alpha", label: "Alpha" },
];

export default function ProfileDialog({
  open,
  onClose,
  initialTab = "account",
}: ProfileDialogProps) {
  const { user, profile, updateProfile } = useAuth();
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Per-tab dirty state. Each tab saves independently.
  const [account, setAccount] = useState({ displayName: "", bio: "" });
  const [chess, setChess] = useState({
    chesscomUsername: "",
    lichessUsername: "",
    selfReportedRating: "",
    primaryPlatform: "" as "" | "chesscom" | "lichess",
  });
  const [coaching, setCoaching] = useState({
    coachTone: "" as "" | CoachTone,
    playingStyle: "" as "" | PlayingStyle,
    studyGoals: [] as StudyGoal[],
    favoriteOpenings: [] as string[],
  });
  const [openingDraft, setOpeningDraft] = useState("");
  const [appearance, setAppearance] = useState({
    boardTheme: "" as "" | BoardTheme,
    pieceSet: "" as "" | PieceSet,
  });

  // Password change form (Account tab)
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedTab, setSavedTab] = useState<TabKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed the tab each time the dialog opens. Without this, a dialog kept
  // mounted (as /profile does) would remember the tab the user last browsed to
  // and ignore the `initialTab` the CTA asked for.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // Hydrate forms from profile when it loads / changes.
  useEffect(() => {
    if (!profile) return;
    setAccount({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
    });
    setChess({
      chesscomUsername: profile.chesscomUsername ?? "",
      lichessUsername: profile.lichessUsername ?? "",
      selfReportedRating:
        profile.selfReportedRating != null ? String(profile.selfReportedRating) : "",
      primaryPlatform: profile.primaryPlatform ?? "",
    });
    setCoaching({
      coachTone: profile.coachTone ?? "",
      playingStyle: profile.playingStyle ?? "",
      studyGoals: profile.studyGoals ?? [],
      favoriteOpenings: profile.favoriteOpenings ?? [],
    });
    setAppearance({
      boardTheme: profile.boardTheme ?? "",
      pieceSet: profile.pieceSet ?? "",
    });
  }, [profile]);

  if (!user || !profile) return null;

  const flashSaved = (key: TabKey) => {
    setSavedTab(key);
    setTimeout(() => setSavedTab((cur) => (cur === key ? null : cur)), 2000);
  };

  const saveTab = async (key: TabKey) => {
    setSaveError(null);
    setSaving(true);
    try {
      if (key === "account") {
        await updateProfile({
          displayName: account.displayName.trim() || undefined,
          bio: account.bio.trim() || undefined,
        });
      } else if (key === "chess") {
        const ratingNum = chess.selfReportedRating
          ? Number.parseInt(chess.selfReportedRating, 10)
          : undefined;
        if (ratingNum !== undefined && Number.isNaN(ratingNum)) {
          throw new Error("Rating must be a number.");
        }
        await updateProfile({
          chesscomUsername: chess.chesscomUsername.trim() || undefined,
          lichessUsername: chess.lichessUsername.trim() || undefined,
          selfReportedRating: ratingNum,
          primaryPlatform: chess.primaryPlatform || undefined,
        });
      } else if (key === "coaching") {
        await updateProfile({
          coachTone: coaching.coachTone || undefined,
          playingStyle: coaching.playingStyle || undefined,
          studyGoals: coaching.studyGoals.length ? coaching.studyGoals : undefined,
          favoriteOpenings: coaching.favoriteOpenings.length
            ? coaching.favoriteOpenings
            : undefined,
        });
      } else if (key === "appearance") {
        await updateProfile({
          boardTheme: appearance.boardTheme || undefined,
          pieceSet: appearance.pieceSet || undefined,
        });
      }
      flashSaved(key);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const submitPasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (pw.next !== pw.confirm) {
      setPwMessage({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setPwSubmitting(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMessage({ kind: "err", text: data.error ?? "Password change failed." });
        return;
      }
      setPwMessage({ kind: "ok", text: "Password updated." });
      setPw({ current: "", next: "", confirm: "" });
    } catch {
      setPwMessage({ kind: "err", text: "Network error." });
    } finally {
      setPwSubmitting(false);
    }
  };

  const addOpening = () => {
    const v = openingDraft.trim();
    if (!v) return;
    if (coaching.favoriteOpenings.includes(v)) {
      setOpeningDraft("");
      return;
    }
    if (coaching.favoriteOpenings.length >= 20) return;
    setCoaching({
      ...coaching,
      favoriteOpenings: [...coaching.favoriteOpenings, v],
    });
    setOpeningDraft("");
  };

  const onOpeningKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addOpening();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 4, overflow: "hidden" } }}
    >
      {/* Header */}
      <Box
        sx={{
          background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
          py: 3,
          px: 3,
          position: "relative",
        }}
      >
        <IconButton
          onClick={onClose}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "rgba(255,255,255,0.7)",
            "&:hover": { color: "#fff" },
          }}
        >
          <Icon icon="mdi:close" />
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            src={user.photoURL || undefined}
            alt={user.displayName || "User"}
            sx={{
              width: 56,
              height: 56,
              bgcolor: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>
              {user.displayName || "Chess Player"}
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)" }}>
              {user.email}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v: TabKey) => {
          setTab(v);
          setSaveError(null);
        }}
        variant="fullWidth"
      >
        <Tab label="Account" value="account" sx={{ textTransform: "none", fontWeight: 600 }} />
        <Tab label="Chess" value="chess" sx={{ textTransform: "none", fontWeight: 600 }} />
        <Tab label="Coaching" value="coaching" sx={{ textTransform: "none", fontWeight: 600 }} />
        <Tab label="Appearance" value="appearance" sx={{ textTransform: "none", fontWeight: 600 }} />
      </Tabs>

      <DialogContent sx={{ py: 3, px: 3 }}>
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}

        {tab === "account" && (
          <Stack spacing={2.5}>
            <TextField
              fullWidth
              size="small"
              label="Display name"
              value={account.displayName}
              onChange={(e) => setAccount({ ...account, displayName: e.target.value })}
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Bio"
              multiline
              rows={2}
              value={account.bio}
              onChange={(e) => setAccount({ ...account, bio: e.target.value })}
              inputProps={{ maxLength: 280 }}
              helperText={`${account.bio.length}/280`}
            />

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton
                saving={saving}
                saved={savedTab === "account"}
                onClick={() => saveTab("account")}
              />
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                Change password
              </Typography>
              <Box component="form" onSubmit={submitPasswordChange}>
                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    label="Current password"
                    autoComplete="current-password"
                    value={pw.current}
                    onChange={(e) => setPw({ ...pw, current: e.target.value })}
                    required
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    label="New password"
                    autoComplete="new-password"
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    helperText="At least 10 characters with a number or symbol."
                    required
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    label="Confirm new password"
                    autoComplete="new-password"
                    value={pw.confirm}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                    required
                  />
                  {pwMessage && (
                    <Alert severity={pwMessage.kind === "ok" ? "success" : "error"}>
                      {pwMessage.text}
                    </Alert>
                  )}
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={pwSubmitting}
                      sx={{ textTransform: "none", fontWeight: 600 }}
                    >
                      {pwSubmitting ? "Updating…" : "Update password"}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Box>
          </Stack>
        )}

        {tab === "chess" && (
          <Stack spacing={2.5}>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img src="https://www.chess.com/favicon.ico" width={18} height={18} alt="Chess.com" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Chess.com Username
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., magnuscarlsen"
                value={chess.chesscomUsername}
                onChange={(e) => setChess({ ...chess, chesscomUsername: e.target.value })}
              />
            </Box>

            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <img src="https://lichess.org/favicon.ico" width={18} height={18} alt="Lichess" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Lichess Username
                </Typography>
              </Box>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., drnykterstein"
                value={chess.lichessUsername}
                onChange={(e) => setChess({ ...chess, lichessUsername: e.target.value })}
              />
            </Box>

            <TextField
              size="small"
              label="Self-reported rating"
              type="number"
              inputProps={{ min: 0, max: 3500 }}
              value={chess.selfReportedRating}
              onChange={(e) => setChess({ ...chess, selfReportedRating: e.target.value })}
              sx={{ maxWidth: 200 }}
              helperText="The coach uses this to calibrate explanations."
            />

            <TextField
              select
              size="small"
              label="Primary platform"
              value={chess.primaryPlatform}
              onChange={(e) =>
                setChess({
                  ...chess,
                  primaryPlatform: e.target.value as "" | "chesscom" | "lichess",
                })
              }
              sx={{ maxWidth: 200 }}
            >
              <MenuItem value="">No preference</MenuItem>
              <MenuItem value="chesscom">Chess.com</MenuItem>
              <MenuItem value="lichess">Lichess</MenuItem>
            </TextField>

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton
                saving={saving}
                saved={savedTab === "chess"}
                onClick={() => saveTab("chess")}
              />
            </Box>
          </Stack>
        )}

        {tab === "coaching" && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Coach tone
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={coaching.coachTone}
                onChange={(_e, v) => v !== null && setCoaching({ ...coaching, coachTone: v })}
                fullWidth
              >
                {COACH_TONES.map((t) => (
                  <ToggleButton
                    key={t.value}
                    value={t.value}
                    sx={{
                      flexDirection: "column",
                      textTransform: "none",
                      px: 1.5,
                      py: 1.25,
                      gap: 0.5,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#666", lineHeight: 1.2 }}>
                      {t.hint}
                    </Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Playing style
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={coaching.playingStyle}
                onChange={(_e, v) => v !== null && setCoaching({ ...coaching, playingStyle: v })}
                fullWidth
              >
                {PLAYING_STYLES.map((s) => (
                  <ToggleButton
                    key={s.value}
                    value={s.value}
                    sx={{
                      flexDirection: "column",
                      textTransform: "none",
                      px: 1.5,
                      py: 1.25,
                      gap: 0.5,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {s.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#666", lineHeight: 1.2 }}>
                      {s.hint}
                    </Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Study goals
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {STUDY_GOALS.map((g) => {
                  const selected = coaching.studyGoals.includes(g.value);
                  return (
                    <Chip
                      key={g.value}
                      label={g.label}
                      onClick={() => {
                        setCoaching({
                          ...coaching,
                          studyGoals: selected
                            ? coaching.studyGoals.filter((x) => x !== g.value)
                            : [...coaching.studyGoals, g.value],
                        });
                      }}
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                    />
                  );
                })}
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Favorite openings
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.25 }}>
                {coaching.favoriteOpenings.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    onDelete={() =>
                      setCoaching({
                        ...coaching,
                        favoriteOpenings: coaching.favoriteOpenings.filter((x) => x !== name),
                      })
                    }
                  />
                ))}
                {coaching.favoriteOpenings.length === 0 && (
                  <Typography variant="caption" sx={{ color: "#999" }}>
                    None yet — add up to 20.
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="e.g., Sicilian Najdorf"
                  value={openingDraft}
                  onChange={(e) => setOpeningDraft(e.target.value)}
                  onKeyDown={onOpeningKeyDown}
                />
                <Button
                  variant="outlined"
                  onClick={addOpening}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Add
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton
                saving={saving}
                saved={savedTab === "coaching"}
                onClick={() => saveTab("coaching")}
              />
            </Box>
          </Stack>
        )}

        {tab === "appearance" && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Board theme
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={appearance.boardTheme}
                onChange={(_e, v) => v !== null && setAppearance({ ...appearance, boardTheme: v })}
                fullWidth
              >
                {BOARD_THEMES.map((t) => (
                  <ToggleButton
                    key={t.value}
                    value={t.value}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    {t.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Piece set
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={appearance.pieceSet}
                onChange={(_e, v) => v !== null && setAppearance({ ...appearance, pieceSet: v })}
                fullWidth
              >
                {PIECE_SETS.map((p) => (
                  <ToggleButton
                    key={p.value}
                    value={p.value}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    {p.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Typography variant="caption" sx={{ color: "#999" }}>
              Visual themes are saved but not yet applied to the board — wiring lands in a follow-up.
            </Typography>

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton
                saving={saving}
                saved={savedTab === "appearance"}
                onClick={() => saveTab("appearance")}
              />
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaveButton({
  saving,
  saved,
  onClick,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="contained"
      onClick={onClick}
      disabled={saving}
      sx={{
        px: 3,
        py: 0.75,
        fontWeight: 700,
        borderRadius: 2.5,
        background: saved
          ? "linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)"
          : "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
        textTransform: "none",
        "&:hover": {
          background: saved
            ? "linear-gradient(135deg, #43A047 0%, #5CB360 100%)"
            : "linear-gradient(135deg, #e85d2c 0%, #e07a38 100%)",
        },
      }}
      startIcon={saved ? <Icon icon="mdi:check" /> : undefined}
    >
      {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
    </Button>
  );
}
